import { PencilLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DeploymentOverviewViewModel } from '@/types/k8s'
import { formatDate } from '@/lib/utils'

import { DeploymentResourceSummary } from './deployment-resource-summary'
import { LabelsAnno } from './lables-anno'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'

function InfoItem(props: {
  label: string
  value: React.ReactNode
  testId?: string
}) {
  const { label, value, testId } = props

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm font-medium" data-testid={testId}>
        {value}
      </div>
    </div>
  )
}

export function DeploymentOverviewInfoCard(props: {
  overview: DeploymentOverviewViewModel
  containerCount: number
  onEdit: () => void
}) {
  const { overview, containerCount, onEdit } = props
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.sections.deploymentInformation')}</CardTitle>
        <CardAction>
          <Button size="sm" onClick={onEdit}>
            <PencilLine className="h-4 w-4" />
            {t(
              containerCount > 1
                ? 'deploymentOverview.editContainers'
                : 'deploymentOverview.editContainer'
            )}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem
            label={t('detail.fields.created')}
            value={
              overview.createdAt
                ? formatDate(overview.createdAt, true)
                : t('deploymentOverview.notSet')
            }
          />
          <InfoItem
            label={t('deploymentOverview.age')}
            value={overview.age || t('deploymentOverview.notSet')}
            testId="deployment-age"
          />
          <InfoItem
            label={t('detail.fields.strategy')}
            value={overview.strategy}
            testId="deployment-strategy"
          />
          <InfoItem
            label={t('detail.fields.replicas')}
            value={overview.specReplicas}
            testId="deployment-replicas"
          />
          <InfoItem
            label={t('deploymentOverview.hostNetwork')}
            value={
              overview.hostNetwork
                ? t('deploymentOverview.enabled')
                : t('deploymentOverview.disabled')
            }
            testId="deployment-host-network"
          />
          <InfoItem
            label={t('deploymentOverview.scheduler')}
            value={overview.schedulerName || t('deploymentOverview.notSet')}
            testId="deployment-scheduler"
          />
          <InfoItem
            label={t('detail.fields.selector')}
            value={
              Object.keys(overview.selectorLabels).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(overview.selectorLabels).map(
                    ([key, value]) => (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {key}: {value}
                      </Badge>
                    )
                  )}
                </div>
              ) : (
                t('deploymentOverview.notSet')
              )
            }
          />
          <InfoItem
            label={t('deploymentOverview.revision')}
            value={overview.revision || t('deploymentOverview.notSet')}
            testId="deployment-revision"
          />
          <InfoItem
            label={t('deploymentOverview.serviceLinks')}
            value={
              overview.serviceLinksEnabled
                ? t('deploymentOverview.enabled')
                : t('deploymentOverview.disabled')
            }
            testId="deployment-service-links"
          />
        </div>

        <DeploymentResourceSummary
          requests={overview.resourceRequests}
          limits={overview.resourceLimits}
        />

        <LabelsAnno
          labels={overview.labels || {}}
          annotations={overview.annotations || {}}
        />
      </CardContent>
    </Card>
  )
}
