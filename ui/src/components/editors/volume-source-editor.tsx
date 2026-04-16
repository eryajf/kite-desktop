import { Volume } from 'kubernetes-types/core/v1'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  RemoveVolumeResult,
  ValidationErrors,
} from '@/hooks/use-deployment-container-editor'

import { ConfigMapSelector } from '../selector/configmap-selector'
import { PVCSelector } from '../selector/pvc-selector'
import { SecretSelector } from '../selector/secret-selector'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

type SupportedVolumeType =
  | 'configMap'
  | 'secret'
  | 'pvc'
  | 'emptyDir'
  | 'hostPath'

function getVolumeType(volume: Volume): SupportedVolumeType {
  if (volume.configMap) {
    return 'configMap'
  }
  if (volume.secret) {
    return 'secret'
  }
  if (volume.persistentVolumeClaim) {
    return 'pvc'
  }
  if (volume.hostPath) {
    return 'hostPath'
  }
  return 'emptyDir'
}

function createVolume(name: string, type: SupportedVolumeType): Volume {
  if (type === 'configMap') {
    return { name, configMap: { name: '' } }
  }
  if (type === 'secret') {
    return { name, secret: { secretName: '' } }
  }
  if (type === 'pvc') {
    return { name, persistentVolumeClaim: { claimName: '' } }
  }
  if (type === 'hostPath') {
    return { name, hostPath: { path: '' } }
  }
  return { name, emptyDir: {} }
}

function nextVolumeName(volumes: Volume[]) {
  return `volume-${volumes.length + 1}`
}

export function VolumeSourceEditor(props: {
  namespace: string
  volumes: Volume[]
  errors: ValidationErrors
  onUpdate: (volumes: Volume[]) => void
  onRemoveVolume: (volumeName: string) => RemoveVolumeResult
}) {
  const { namespace, volumes, errors, onUpdate, onRemoveVolume } = props
  const { t } = useTranslation()

  const addVolume = () => {
    onUpdate([...volumes, createVolume(nextVolumeName(volumes), 'emptyDir')])
  }

  const setVolume = (index: number, nextVolume: Volume) => {
    onUpdate(
      volumes.map((volume, volumeIndex) =>
        volumeIndex === index ? nextVolume : volume
      )
    )
  }

  const updateVolume = (index: number, updates: Partial<Volume>) => {
    setVolume(index, { ...volumes[index], ...updates })
  }

  const replaceVolumeType = (index: number, type: SupportedVolumeType) => {
    const currentVolume = volumes[index]
    setVolume(index, createVolume(currentVolume.name, type))
  }

  const removeVolume = (volume: Volume) => {
    const result = onRemoveVolume(volume.name)
    if (!result.ok) {
      toast.error(
        t('containerEditor.mounts.volumeInUse', {
          volume: result.volumeName,
          containers: result.referencedBy.join(', '),
        })
      )
    }
  }

  const errorFor = (index: number, field: string) =>
    errors[`volumes.${index}.${field}`]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">
            {t('containerEditor.mounts.volumes')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('containerEditor.mounts.volumesHint')}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={addVolume}>
          <Plus className="h-4 w-4 mr-1" />
          {t('containerEditor.mounts.addVolume')}
        </Button>
      </div>

      {volumes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t('containerEditor.mounts.emptyVolumes')}
        </div>
      ) : null}

      <div className="space-y-3">
        {volumes.map((volume, index) => {
          const volumeType = getVolumeType(volume)

          return (
            <div
              key={`${volume.name}-${index}`}
              className="rounded-lg border p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t('containerEditor.mounts.volumeCard', {
                    index: index + 1,
                  })}
                </Label>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeVolume(volume)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('containerEditor.mounts.volumeName')}</Label>
                  <Input
                    value={volume.name}
                    onChange={(event) =>
                      updateVolume(index, { name: event.target.value })
                    }
                    placeholder="config-volume"
                  />
                  {errorFor(index, 'name') ? (
                    <p className="text-xs text-destructive">
                      {errorFor(index, 'name')}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>{t('containerEditor.mounts.volumeType')}</Label>
                  <Select
                    value={volumeType}
                    onValueChange={(value) =>
                      replaceVolumeType(index, value as SupportedVolumeType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="configMap">ConfigMap</SelectItem>
                      <SelectItem value="secret">Secret</SelectItem>
                      <SelectItem value="pvc">PVC</SelectItem>
                      <SelectItem value="emptyDir">EmptyDir</SelectItem>
                      <SelectItem value="hostPath">HostPath</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {volume.configMap ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label>ConfigMap</Label>
                    <ConfigMapSelector
                      namespace={namespace}
                      selectedConfigMap={volume.configMap.name || ''}
                      onConfigMapChange={(value) =>
                        updateVolume(index, {
                          configMap: { ...volume.configMap, name: value },
                        })
                      }
                    />
                    {errorFor(index, 'configMap.name') ? (
                      <p className="text-xs text-destructive">
                        {errorFor(index, 'configMap.name')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {volume.secret ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Secret</Label>
                    <SecretSelector
                      namespace={namespace}
                      selectedSecret={volume.secret.secretName || ''}
                      onSecretChange={(value) =>
                        updateVolume(index, {
                          secret: {
                            ...volume.secret,
                            secretName: value,
                          },
                        })
                      }
                    />
                    {errorFor(index, 'secret.secretName') ? (
                      <p className="text-xs text-destructive">
                        {errorFor(index, 'secret.secretName')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {volume.persistentVolumeClaim ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label>PVC</Label>
                    <PVCSelector
                      namespace={namespace}
                      selectedPVC={volume.persistentVolumeClaim.claimName || ''}
                      onPVCChange={(value) =>
                        updateVolume(index, {
                          persistentVolumeClaim: {
                            ...volume.persistentVolumeClaim,
                            claimName: value,
                          },
                        })
                      }
                    />
                    {errorFor(index, 'persistentVolumeClaim.claimName') ? (
                      <p className="text-xs text-destructive">
                        {errorFor(index, 'persistentVolumeClaim.claimName')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {volume.hostPath ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t('containerEditor.mounts.hostPath')}</Label>
                    <Input
                      value={volume.hostPath.path || ''}
                      onChange={(event) =>
                        updateVolume(index, {
                          hostPath: {
                            ...volume.hostPath,
                            path: event.target.value,
                          },
                        })
                      }
                      placeholder="/data/app"
                    />
                    {errorFor(index, 'hostPath.path') ? (
                      <p className="text-xs text-destructive">
                        {errorFor(index, 'hostPath.path')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {volume.emptyDir ? (
                  <>
                    <div className="space-y-2">
                      <Label>
                        {t('containerEditor.mounts.emptyDirMedium')}
                      </Label>
                      <Input
                        value={volume.emptyDir.medium || ''}
                        onChange={(event) =>
                          updateVolume(index, {
                            emptyDir: {
                              ...volume.emptyDir,
                              medium: event.target.value || undefined,
                            },
                          })
                        }
                        placeholder="Memory"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('containerEditor.mounts.sizeLimit')}</Label>
                      <Input
                        value={volume.emptyDir.sizeLimit || ''}
                        onChange={(event) =>
                          updateVolume(index, {
                            emptyDir: {
                              ...volume.emptyDir,
                              sizeLimit: event.target.value || undefined,
                            },
                          })
                        }
                        placeholder="1Gi"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
