import { Container, VolumeMount } from 'kubernetes-types/core/v1'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ValidationErrors } from '@/hooks/use-deployment-container-editor'

import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

export function VolumeMountEditor(props: {
  container: Container
  containerIndex: number
  availableVolumes: string[]
  errors: ValidationErrors
  onUpdate: (updates: Partial<Container>) => void
}) {
  const { container, containerIndex, availableVolumes, errors, onUpdate } =
    props
  const { t } = useTranslation()
  const mounts = container.volumeMounts || []

  const updateMounts = (nextMounts: VolumeMount[]) => {
    onUpdate({ volumeMounts: nextMounts })
  }

  const addMount = () => {
    updateMounts([
      ...mounts,
      {
        name: availableVolumes[0] || '',
        mountPath: '',
        readOnly: false,
      },
    ])
  }

  const updateMount = (index: number, updates: Partial<VolumeMount>) => {
    const nextMounts = mounts.map((mount, mountIndex) =>
      mountIndex === index ? { ...mount, ...updates } : mount
    )
    updateMounts(nextMounts)
  }

  const removeMount = (index: number) => {
    updateMounts(mounts.filter((_, mountIndex) => mountIndex !== index))
  }

  const errorFor = (index: number, field: 'name' | 'mountPath' | 'subPath') =>
    errors[`containers.${containerIndex}.volumeMounts.${index}.${field}`]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">
            {t('containerEditor.mounts.volumeMounts')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('containerEditor.mounts.volumeMountsHint')}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={addMount}>
          <Plus className="h-4 w-4 mr-1" />
          {t('containerEditor.mounts.addMount')}
        </Button>
      </div>

      {mounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t('containerEditor.mounts.emptyMounts')}
        </div>
      ) : null}

      <div className="space-y-3">
        {mounts.map((mount, index) => (
          <div key={index} className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <Label className="text-sm font-medium">
                {t('containerEditor.mounts.mountCard', {
                  index: index + 1,
                })}
              </Label>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeMount(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('containerEditor.mounts.volumeName')}</Label>
                <Select
                  value={mount.name || undefined}
                  onValueChange={(value) => updateMount(index, { name: value })}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('containerEditor.mounts.selectVolume')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVolumes.map((volumeName) => (
                      <SelectItem key={volumeName} value={volumeName}>
                        {volumeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errorFor(index, 'name') ? (
                  <p className="text-xs text-destructive">
                    {errorFor(index, 'name')}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t('containerEditor.mounts.mountPath')}</Label>
                <Input
                  value={mount.mountPath || ''}
                  onChange={(event) =>
                    updateMount(index, { mountPath: event.target.value })
                  }
                  placeholder="/app/config"
                />
                {errorFor(index, 'mountPath') ? (
                  <p className="text-xs text-destructive">
                    {errorFor(index, 'mountPath')}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t('containerEditor.mounts.subPath')}</Label>
                <Input
                  value={mount.subPath || ''}
                  onChange={(event) =>
                    updateMount(index, {
                      subPath: event.target.value || undefined,
                    })
                  }
                  placeholder="configs/app.yaml"
                />
              </div>

              <div className="flex items-center gap-3 pt-7">
                <Checkbox
                  checked={mount.readOnly === true}
                  onCheckedChange={(checked) =>
                    updateMount(index, { readOnly: checked === true })
                  }
                  id={`mount-readonly-${index}`}
                />
                <Label htmlFor={`mount-readonly-${index}`}>
                  {t('containerEditor.mounts.readOnly')}
                </Label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {availableVolumes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t('containerEditor.mounts.noVolumes')}
        </div>
      ) : null}
    </div>
  )
}
