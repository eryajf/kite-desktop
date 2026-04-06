import { Container } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface ResourceEditorProps {
  container: Container
  onUpdate: (updates: Partial<Container>) => void
}

export function ResourceEditor({ container, onUpdate }: ResourceEditorProps) {
  const { t } = useTranslation()
  const updateResources = (
    type: 'requests' | 'limits',
    resource: 'cpu' | 'memory',
    value: string
  ) => {
    onUpdate({
      resources: {
        ...container.resources,
        [type]: {
          ...container.resources?.[type],
          [resource]: value || undefined,
        },
      },
    })
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      {/* Requests */}
      <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">
            {t('resourceEditor.resourceRequests')}
          </Label>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cpu-request" className="text-sm">
              {t('resourceEditor.cpuRequest')}
            </Label>
            <Input
              id="cpu-request"
              value={container.resources?.requests?.cpu || ''}
              onChange={(e) =>
                updateResources('requests', 'cpu', e.target.value)
              }
              placeholder="100m"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('resourceEditor.cpuRequestHint')}
            </p>
          </div>
          <div>
            <Label htmlFor="memory-request" className="text-sm">
              {t('resourceEditor.memoryRequest')}
            </Label>
            <Input
              id="memory-request"
              value={container.resources?.requests?.memory || ''}
              onChange={(e) =>
                updateResources('requests', 'memory', e.target.value)
              }
              placeholder="128Mi"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('resourceEditor.memoryRequestHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Limits */}
      <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">
            {t('resourceEditor.resourceLimits')}
          </Label>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cpu-limit" className="text-sm">
              {t('resourceEditor.cpuLimit')}
            </Label>
            <Input
              id="cpu-limit"
              value={container.resources?.limits?.cpu || ''}
              onChange={(e) => updateResources('limits', 'cpu', e.target.value)}
              placeholder="500m"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('resourceEditor.cpuLimitHint')}
            </p>
          </div>
          <div>
            <Label htmlFor="memory-limit" className="text-sm">
              {t('resourceEditor.memoryLimit')}
            </Label>
            <Input
              id="memory-limit"
              value={container.resources?.limits?.memory || ''}
              onChange={(e) =>
                updateResources('limits', 'memory', e.target.value)
              }
              placeholder="512Mi"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('resourceEditor.memoryLimitHint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
