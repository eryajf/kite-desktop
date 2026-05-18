import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  PersistentVolume,
  PersistentVolumeClaim,
} from 'kubernetes-types/core/v1'
import type { StorageClass } from 'kubernetes-types/storage/v1'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { createResource } from '@/lib/api'
import { translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type KeyValueMap = Record<string, string>
type PersistentVolumeAccessMode =
  | 'ReadWriteOnce'
  | 'ReadOnlyMany'
  | 'ReadWriteMany'
type StorageVolumeBindingMode = 'Immediate' | 'WaitForFirstConsumer'
type StorageClassTemplateId =
  | 'generic'
  | 'alibaba-disk'
  | 'tencent-cbs'
  | 'aws-ebs'
  | 'aws-eks-auto-ebs'
  | 'aws-efs'

type StorageClassTemplate = {
  id: StorageClassTemplateId
  labelKey: string
  name: string
  provisioner: string
  reclaimPolicy: 'Delete' | 'Retain'
  bindingMode: StorageVolumeBindingMode
  allowExpansion: boolean
  parameters: KeyValueMap
  mountOptions?: string[]
  autoModeTopology?: boolean
}

const storageClassTemplates: StorageClassTemplate[] = [
  {
    id: 'generic',
    labelKey: 'storageCreate.template.generic',
    name: 'local-static',
    provisioner: 'kubernetes.io/no-provisioner',
    reclaimPolicy: 'Retain',
    bindingMode: 'WaitForFirstConsumer',
    allowExpansion: false,
    parameters: {},
  },
  {
    id: 'alibaba-disk',
    labelKey: 'storageCreate.template.alibabaDisk',
    name: 'alibaba-cloud-disk',
    provisioner: 'diskplugin.csi.alibabacloud.com',
    reclaimPolicy: 'Delete',
    bindingMode: 'Immediate',
    allowExpansion: true,
    parameters: {
      type: 'cloud_essd,cloud_ssd,cloud_efficiency',
      encrypted: 'false',
    },
  },
  {
    id: 'tencent-cbs',
    labelKey: 'storageCreate.template.tencentCbs',
    name: 'tencent-cbs',
    provisioner: 'com.tencent.cloud.csi.cbs',
    reclaimPolicy: 'Delete',
    bindingMode: 'WaitForFirstConsumer',
    allowExpansion: true,
    parameters: {
      type: 'CLOUD_PREMIUM',
      paymode: 'POSTPAID_BY_HOUR',
      renewflag: 'NOTIFY_AND_MANUAL_RENEW',
    },
  },
  {
    id: 'aws-ebs',
    labelKey: 'storageCreate.template.awsEbs',
    name: 'aws-ebs-gp3',
    provisioner: 'ebs.csi.aws.com',
    reclaimPolicy: 'Delete',
    bindingMode: 'WaitForFirstConsumer',
    allowExpansion: true,
    parameters: {
      type: 'gp3',
      encrypted: 'true',
      'csi.storage.k8s.io/fstype': 'ext4',
    },
  },
  {
    id: 'aws-eks-auto-ebs',
    labelKey: 'storageCreate.template.awsEksAutoEbs',
    name: 'aws-auto-ebs-gp3',
    provisioner: 'ebs.csi.eks.amazonaws.com',
    reclaimPolicy: 'Delete',
    bindingMode: 'WaitForFirstConsumer',
    allowExpansion: true,
    parameters: {
      type: 'gp3',
      encrypted: 'true',
      'csi.storage.k8s.io/fstype': 'ext4',
    },
    autoModeTopology: true,
  },
  {
    id: 'aws-efs',
    labelKey: 'storageCreate.template.awsEfs',
    name: 'aws-efs',
    provisioner: 'efs.csi.aws.com',
    reclaimPolicy: 'Retain',
    bindingMode: 'Immediate',
    allowExpansion: false,
    parameters: {
      provisioningMode: 'efs-ap',
      fileSystemId: 'fs-xxxxxxxx',
      directoryPerms: '700',
    },
  },
]

function parseKeyValueLines(value: string): KeyValueMap {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf('=')
        if (separatorIndex === -1) {
          return [line, '']
        }
        return [
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim(),
        ]
      })
      .filter(([key]) => Boolean(key))
  )
}

function parseListLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatKeyValueLines(values: KeyValueMap) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function AccessModeSelect({
  value,
  onChange,
}: {
  value: PersistentVolumeAccessMode
  onChange: (value: PersistentVolumeAccessMode) => void
}) {
  const { t } = useTranslation()

  return (
    <Select value={value} onValueChange={(next) => onChange(next as PersistentVolumeAccessMode)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ReadWriteOnce">{t('storageCreate.accessMode.rwo')}</SelectItem>
        <SelectItem value="ReadOnlyMany">{t('storageCreate.accessMode.rom')}</SelectItem>
        <SelectItem value="ReadWriteMany">{t('storageCreate.accessMode.rwm')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function StorageClassCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (storageClass: StorageClass) => void
}) {
  const { t } = useTranslation()
  const [templateId, setTemplateId] =
    useState<StorageClassTemplateId>('generic')
  const [name, setName] = useState('')
  const [provisioner, setProvisioner] = useState('kubernetes.io/no-provisioner')
  const [reclaimPolicy, setReclaimPolicy] = useState<'Delete' | 'Retain'>('Delete')
  const [bindingMode, setBindingMode] =
    useState<StorageVolumeBindingMode>('Immediate')
  const [allowExpansion, setAllowExpansion] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [parameters, setParameters] = useState('')
  const [mountOptions, setMountOptions] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const selectedTemplate = useMemo(
    () =>
      storageClassTemplates.find((template) => template.id === templateId) ||
      storageClassTemplates[0],
    [templateId]
  )

  useEffect(() => {
    if (!open) {
      setTemplateId('generic')
      setName('')
      setProvisioner('kubernetes.io/no-provisioner')
      setReclaimPolicy('Delete')
      setBindingMode('Immediate')
      setAllowExpansion(true)
      setIsDefault(false)
      setParameters('')
      setMountOptions('')
      setIsCreating(false)
    }
  }, [open])

  const applyTemplate = (nextTemplateId: StorageClassTemplateId) => {
    const template =
      storageClassTemplates.find((item) => item.id === nextTemplateId) ||
      storageClassTemplates[0]

    setTemplateId(template.id)
    setName(template.name)
    setProvisioner(template.provisioner)
    setReclaimPolicy(template.reclaimPolicy)
    setBindingMode(template.bindingMode)
    setAllowExpansion(template.allowExpansion)
    setParameters(formatKeyValueLines(template.parameters))
    setMountOptions((template.mountOptions || []).join('\n'))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedProvisioner = provisioner.trim()
    if (!trimmedName || !trimmedProvisioner) return

    setIsCreating(true)
    try {
      const parsedParameters = parseKeyValueLines(parameters)
      const finalParameters = { ...parsedParameters }
      if (
        selectedTemplate.autoModeTopology &&
        !finalParameters.allowedTopologies
      ) {
        finalParameters.allowedTopologies =
          'eks.amazonaws.com/compute-type=auto'
      }
      const parsedMountOptions = parseListLines(mountOptions)
      const storageClass: StorageClass = {
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: {
          name: trimmedName,
          annotations: isDefault
            ? {
                'storageclass.kubernetes.io/is-default-class': 'true',
              }
            : undefined,
        },
        provisioner: trimmedProvisioner,
        reclaimPolicy,
        volumeBindingMode: bindingMode,
        allowVolumeExpansion: allowExpansion || undefined,
        parameters:
          Object.keys(finalParameters).length > 0 ? finalParameters : undefined,
        mountOptions: parsedMountOptions.length > 0 ? parsedMountOptions : undefined,
      }

      const created = await createResource('storageclasses', undefined, storageClass)
      toast.success(t('storageCreate.storageClassSuccess', { name: trimmedName }))
      onOpenChange(false)
      onSuccess(created)
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('storageCreate.storageClassTitle')}</DialogTitle>
          <DialogDescription>
            {t('storageCreate.storageClassDescription')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>{t('storageCreate.templateLabel')}</Label>
            <Select value={templateId} onValueChange={(value) => applyTemplate(value as StorageClassTemplateId)}>
              <SelectTrigger aria-label={t('storageCreate.templateLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storageClassTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {t(template.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t('storageCreate.templateHint')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="storage-class-name">{t('common.name')}</Label>
              <Input
                id="storage-class-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="fast-ssd"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-class-provisioner">
                {t('storageClasses.provisioner')}
              </Label>
              <Input
                id="storage-class-provisioner"
                value={provisioner}
                onChange={(event) => setProvisioner(event.target.value)}
                placeholder="ebs.csi.aws.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('pvs.reclaimPolicy')}</Label>
              <Select
                value={reclaimPolicy}
                onValueChange={(value) => setReclaimPolicy(value as 'Delete' | 'Retain')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Delete">Delete</SelectItem>
                  <SelectItem value="Retain">Retain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('storageClasses.volumeBindingMode')}</Label>
              <Select
                value={bindingMode}
                onValueChange={(value) =>
                  setBindingMode(value as StorageVolumeBindingMode)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Immediate">Immediate</SelectItem>
                  <SelectItem value="WaitForFirstConsumer">WaitForFirstConsumer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border p-3">
              <Switch checked={allowExpansion} onCheckedChange={setAllowExpansion} />
              <span className="text-sm">{t('storageClasses.allowExpansion')}</span>
            </label>
            <label className="flex items-center gap-3 rounded-md border p-3">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <span className="text-sm">{t('storageClasses.defaultClass')}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="storage-class-parameters">
                {t('storageClasses.parameters')}
              </Label>
              <Textarea
                id="storage-class-parameters"
                value={parameters}
                onChange={(event) => setParameters(event.target.value)}
                placeholder={'type=gp3\nencrypted=true'}
                className="min-h-24 font-mono"
              />
              {selectedTemplate.autoModeTopology ? (
                <p className="text-muted-foreground text-xs">
                  {t('storageCreate.awsAutoModeHint')}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-class-mount-options">
                {t('storageClasses.mountOptions')}
              </Label>
              <Textarea
                id="storage-class-mount-options"
                value={mountOptions}
                onChange={(event) => setMountOptions(event.target.value)}
                placeholder="discard"
                className="min-h-24 font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isCreating || !name.trim() || !provisioner.trim()}>
              {isCreating ? t('common.creating') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PVCCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (pvc: PersistentVolumeClaim, namespace: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [storageClassName, setStorageClassName] = useState('')
  const [storage, setStorage] = useState('10Gi')
  const [accessMode, setAccessMode] =
    useState<PersistentVolumeAccessMode>('ReadWriteOnce')
  const [volumeMode, setVolumeMode] = useState<'Filesystem' | 'Block'>('Filesystem')
  const [volumeName, setVolumeName] = useState('')
  const [labels, setLabels] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setNamespace('default')
      setStorageClassName('')
      setStorage('10Gi')
      setAccessMode('ReadWriteOnce')
      setVolumeMode('Filesystem')
      setVolumeName('')
      setLabels('')
      setIsCreating(false)
    }
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedNamespace = namespace.trim()
    const trimmedStorage = storage.trim()
    if (!trimmedName || !trimmedNamespace || !trimmedStorage) return

    setIsCreating(true)
    try {
      const parsedLabels = parseKeyValueLines(labels)
      const pvc: PersistentVolumeClaim = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: trimmedName,
          namespace: trimmedNamespace,
          labels: Object.keys(parsedLabels).length > 0 ? parsedLabels : undefined,
        },
        spec: {
          accessModes: [accessMode],
          volumeMode,
          storageClassName: storageClassName.trim() || undefined,
          volumeName: volumeName.trim() || undefined,
          resources: {
            requests: {
              storage: trimmedStorage,
            },
          },
        },
      }

      const created = await createResource(
        'persistentvolumeclaims',
        trimmedNamespace,
        pvc
      )
      toast.success(t('storageCreate.pvcSuccess', { name: trimmedName }))
      onOpenChange(false)
      onSuccess(created, trimmedNamespace)
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('storageCreate.pvcTitle')}</DialogTitle>
          <DialogDescription>{t('storageCreate.pvcDescription')}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pvc-name">{t('common.name')}</Label>
              <Input id="pvc-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="data-web-0" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pvc-namespace">{t('detail.fields.namespace')}</Label>
              <Input id="pvc-namespace" value={namespace} onChange={(event) => setNamespace(event.target.value)} placeholder="default" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pvc-storage">{t('storageCreate.requestStorage')}</Label>
              <Input id="pvc-storage" value={storage} onChange={(event) => setStorage(event.target.value)} placeholder="10Gi" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pvc-storage-class">{t('pvcs.storageClass')}</Label>
              <Input id="pvc-storage-class" value={storageClassName} onChange={(event) => setStorageClassName(event.target.value)} placeholder={t('storageCreate.storageClassOptional')} />
            </div>
            <div className="space-y-2">
              <Label>{t('pvcs.accessModes')}</Label>
              <AccessModeSelect value={accessMode} onChange={setAccessMode} />
            </div>
            <div className="space-y-2">
              <Label>{t('storageDetails.volumeMode')}</Label>
              <Select value={volumeMode} onValueChange={(value) => setVolumeMode(value as 'Filesystem' | 'Block')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Filesystem">Filesystem</SelectItem>
                  <SelectItem value="Block">Block</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pvc-volume-name">{t('storageCreate.boundVolumeOptional')}</Label>
              <Input id="pvc-volume-name" value={volumeName} onChange={(event) => setVolumeName(event.target.value)} placeholder="pv-data-web-0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pvc-labels">{t('detail.fields.labels')}</Label>
              <Textarea id="pvc-labels" value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="app=web" className="min-h-20 font-mono" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isCreating || !name.trim() || !namespace.trim() || !storage.trim()}>
              {isCreating ? t('common.creating') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PVCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (pv: PersistentVolume) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('10Gi')
  const [storageClassName, setStorageClassName] = useState('')
  const [accessMode, setAccessMode] =
    useState<PersistentVolumeAccessMode>('ReadWriteOnce')
  const [volumeMode, setVolumeMode] = useState<'Filesystem' | 'Block'>('Filesystem')
  const [reclaimPolicy, setReclaimPolicy] = useState<'Retain' | 'Delete' | 'Recycle'>('Retain')
  const [sourceType, setSourceType] = useState<'hostPath' | 'nfs' | 'local'>('hostPath')
  const [path, setPath] = useState('/data')
  const [nfsServer, setNfsServer] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [nodeHostname, setNodeHostname] = useState('')
  const [labels, setLabels] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setCapacity('10Gi')
      setStorageClassName('')
      setAccessMode('ReadWriteOnce')
      setVolumeMode('Filesystem')
      setReclaimPolicy('Retain')
      setSourceType('hostPath')
      setPath('/data')
      setNfsServer('')
      setReadOnly(false)
      setNodeHostname('')
      setLabels('')
      setIsCreating(false)
    }
  }, [open])

  const sourceSpec = useMemo(() => {
    if (sourceType === 'nfs') {
      return {
        nfs: {
          server: nfsServer.trim(),
          path: path.trim(),
          readOnly,
        },
      }
    }
    if (sourceType === 'local') {
      return {
        local: {
          path: path.trim(),
        },
      }
    }
    return {
      hostPath: {
        path: path.trim(),
        type: 'DirectoryOrCreate',
      },
    }
  }, [nfsServer, path, readOnly, sourceType])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedCapacity = capacity.trim()
    const trimmedPath = path.trim()
    if (!trimmedName || !trimmedCapacity || !trimmedPath) return
    if (sourceType === 'nfs' && !nfsServer.trim()) return

    setIsCreating(true)
    try {
      const parsedLabels = parseKeyValueLines(labels)
      const pv: PersistentVolume = {
        apiVersion: 'v1',
        kind: 'PersistentVolume',
        metadata: {
          name: trimmedName,
          labels: Object.keys(parsedLabels).length > 0 ? parsedLabels : undefined,
        },
        spec: {
          capacity: {
            storage: trimmedCapacity,
          },
          accessModes: [accessMode],
          volumeMode,
          persistentVolumeReclaimPolicy: reclaimPolicy,
          storageClassName: storageClassName.trim() || undefined,
          ...sourceSpec,
          nodeAffinity:
            sourceType === 'local' && nodeHostname.trim()
              ? {
                  required: {
                    nodeSelectorTerms: [
                      {
                        matchExpressions: [
                          {
                            key: 'kubernetes.io/hostname',
                            operator: 'In',
                            values: [nodeHostname.trim()],
                          },
                        ],
                      },
                    ],
                  },
                }
              : undefined,
        },
      }

      const created = await createResource('persistentvolumes', undefined, pv)
      toast.success(t('storageCreate.pvSuccess', { name: trimmedName }))
      onOpenChange(false)
      onSuccess(created)
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('storageCreate.pvTitle')}</DialogTitle>
          <DialogDescription>{t('storageCreate.pvDescription')}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pv-name">{t('common.name')}</Label>
              <Input id="pv-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="pv-data-web-0" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pv-capacity">{t('pvs.capacity')}</Label>
              <Input id="pv-capacity" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="10Gi" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pv-storage-class">{t('pvs.storageClass')}</Label>
              <Input id="pv-storage-class" value={storageClassName} onChange={(event) => setStorageClassName(event.target.value)} placeholder={t('storageCreate.storageClassOptional')} />
            </div>
            <div className="space-y-2">
              <Label>{t('pvs.reclaimPolicy')}</Label>
              <Select value={reclaimPolicy} onValueChange={(value) => setReclaimPolicy(value as 'Retain' | 'Delete' | 'Recycle')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Retain">Retain</SelectItem>
                  <SelectItem value="Delete">Delete</SelectItem>
                  <SelectItem value="Recycle">Recycle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('pvs.accessModes')}</Label>
              <AccessModeSelect value={accessMode} onChange={setAccessMode} />
            </div>
            <div className="space-y-2">
              <Label>{t('storageDetails.volumeMode')}</Label>
              <Select value={volumeMode} onValueChange={(value) => setVolumeMode(value as 'Filesystem' | 'Block')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Filesystem">Filesystem</SelectItem>
                  <SelectItem value="Block">Block</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label>{t('storageDetails.volumeSource')}</Label>
              <Select value={sourceType} onValueChange={(value) => setSourceType(value as 'hostPath' | 'nfs' | 'local')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hostPath">HostPath</SelectItem>
                  <SelectItem value="nfs">NFS</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sourceType === 'nfs' ? (
                <div className="space-y-2">
                  <Label htmlFor="pv-nfs-server">{t('storageCreate.nfsServer')}</Label>
                  <Input id="pv-nfs-server" value={nfsServer} onChange={(event) => setNfsServer(event.target.value)} placeholder="10.0.0.10" />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="pv-source-path">{t('storageCreate.sourcePath')}</Label>
                <Input id="pv-source-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/data" />
              </div>
              {sourceType === 'local' ? (
                <div className="space-y-2">
                  <Label htmlFor="pv-node-hostname">{t('storageCreate.nodeHostnameOptional')}</Label>
                  <Input id="pv-node-hostname" value={nodeHostname} onChange={(event) => setNodeHostname(event.target.value)} placeholder="worker-1" />
                </div>
              ) : null}
            </div>
            {sourceType === 'nfs' ? (
              <label className="flex items-center gap-3 text-sm">
                <Checkbox checked={readOnly} onCheckedChange={(value) => setReadOnly(value === true)} />
                {t('storageCreate.readOnly')}
              </label>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pv-labels">{t('detail.fields.labels')}</Label>
            <Textarea id="pv-labels" value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="tier=storage" className="min-h-20 font-mono" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                isCreating ||
                !name.trim() ||
                !capacity.trim() ||
                !path.trim() ||
                (sourceType === 'nfs' && !nfsServer.trim())
              }
            >
              {isCreating ? t('common.creating') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
