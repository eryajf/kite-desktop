import { useEffect, useState, type FormEvent } from 'react'
import type {
  PersistentVolume,
  PersistentVolumeClaim,
} from 'kubernetes-types/core/v1'
import type { StorageClass } from 'kubernetes-types/storage/v1'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { patchResource } from '@/lib/api'
import { translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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

type ReclaimPolicy = 'Retain' | 'Delete' | 'Recycle'

const DEFAULT_STORAGE_CLASS_ANNOTATION =
  'storageclass.kubernetes.io/is-default-class'
const BETA_DEFAULT_STORAGE_CLASS_ANNOTATION =
  'storageclass.beta.kubernetes.io/is-default-class'

export function isDefaultStorageClass(storageClass: StorageClass) {
  const annotations = storageClass.metadata?.annotations || {}
  return (
    annotations[DEFAULT_STORAGE_CLASS_ANNOTATION] === 'true' ||
    annotations[BETA_DEFAULT_STORAGE_CLASS_ANNOTATION] === 'true'
  )
}

export async function setStorageClassDefault(
  storageClass: StorageClass,
  nextDefault: boolean
) {
  const name = storageClass.metadata?.name
  if (!name) return

  await patchResource('storageclasses', name, undefined, {
    metadata: {
      annotations: {
        ...(storageClass.metadata?.annotations || {}),
        [DEFAULT_STORAGE_CLASS_ANNOTATION]: nextDefault ? 'true' : 'false',
        [BETA_DEFAULT_STORAGE_CLASS_ANNOTATION]: 'false',
      },
    },
  })
}

export function PVCResizeDialog({
  open,
  onOpenChange,
  pvc,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pvc: PersistentVolumeClaim | null
  onSuccess?: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [storage, setStorage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open || !pvc) {
      setStorage('')
      setIsSaving(false)
      return
    }

    setStorage(
      pvc.spec?.resources?.requests?.storage ||
        pvc.status?.capacity?.storage ||
        ''
    )
    setIsSaving(false)
  }, [open, pvc])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = pvc?.metadata?.name
    const namespace = pvc?.metadata?.namespace
    const nextStorage = storage.trim()
    if (!name || !namespace || !nextStorage) return

    setIsSaving(true)
    try {
      await patchResource('persistentvolumeclaims', name, namespace, {
        spec: {
          resources: {
            requests: {
              storage: nextStorage,
            },
          },
        },
      })
      toast.success(t('storageEdit.resizePVCSuccess', { name }))
      onOpenChange(false)
      await onSuccess?.()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('storageEdit.resizePVCTitle')}</DialogTitle>
          <DialogDescription>
            {t('storageEdit.resizePVCDescription')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="pvc-resize-storage">
              {t('storageEdit.newStorageSize')}
            </Label>
            <Input
              id="pvc-resize-storage"
              value={storage}
              onChange={(event) => setStorage(event.target.value)}
              placeholder="20Gi"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t('storageEdit.resizePVCHint')}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !storage.trim()}>
              {isSaving ? t('common.applying') : t('common.apply')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PVReclaimPolicyDialog({
  open,
  onOpenChange,
  pv,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pv: PersistentVolume | null
  onSuccess?: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [policy, setPolicy] = useState<ReclaimPolicy>('Retain')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open || !pv) {
      setPolicy('Retain')
      setIsSaving(false)
      return
    }

    setPolicy((pv.spec?.persistentVolumeReclaimPolicy || 'Retain') as ReclaimPolicy)
    setIsSaving(false)
  }, [open, pv])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = pv?.metadata?.name
    if (!name) return

    setIsSaving(true)
    try {
      await patchResource('persistentvolumes', name, undefined, {
        spec: {
          persistentVolumeReclaimPolicy: policy,
        },
      })
      toast.success(t('storageEdit.reclaimPolicySuccess', { name }))
      onOpenChange(false)
      await onSuccess?.()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('storageEdit.reclaimPolicyTitle')}</DialogTitle>
          <DialogDescription>
            {t('storageEdit.reclaimPolicyDescription')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>{t('pvs.reclaimPolicy')}</Label>
            <Select
              value={policy}
              onValueChange={(value) => setPolicy(value as ReclaimPolicy)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Retain">Retain</SelectItem>
                <SelectItem value="Delete">Delete</SelectItem>
                <SelectItem value="Recycle">Recycle</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('storageEdit.reclaimPolicyHint')}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? t('common.applying') : t('common.apply')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
