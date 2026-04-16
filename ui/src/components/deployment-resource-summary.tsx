import { useTranslation } from 'react-i18next'

import { DeploymentResourceSummaryValue } from '@/types/k8s'

import { Badge } from './ui/badge'
import { Label } from './ui/label'

function ResourceLine(props: {
  label: string
  value: DeploymentResourceSummaryValue
  emptyText: string
}) {
  const { label, value, emptyText } = props

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {value.cpu || value.memory ? (
        <div className="flex flex-wrap gap-2">
          {value.cpu ? (
            <Badge variant="secondary">CPU: {value.cpu}</Badge>
          ) : null}
          {value.memory ? (
            <Badge variant="secondary">Memory: {value.memory}</Badge>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  )
}

export function DeploymentResourceSummary(props: {
  requests: DeploymentResourceSummaryValue
  limits: DeploymentResourceSummaryValue
}) {
  const { requests, limits } = props
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 rounded-lg border border-dashed p-4 md:grid-cols-2">
      <ResourceLine
        label={t('deploymentOverview.resourceRequests')}
        value={requests}
        emptyText={t('deploymentOverview.notSet')}
      />
      <ResourceLine
        label={t('deploymentOverview.resourceLimits')}
        value={limits}
        emptyText={t('deploymentOverview.notSet')}
      />
    </div>
  )
}
