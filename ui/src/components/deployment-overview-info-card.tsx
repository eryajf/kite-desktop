import { PencilLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DeploymentOverviewViewModel } from '@/types/k8s'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'

import { DeploymentStatusIcon } from './deployment-status-icon'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'

function InfoItem(props: {
  label: string
  value: React.ReactNode
  testId?: string
  className?: string
}) {
  const { label, value, testId, className } = props

  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div
        className="mt-1 text-sm font-medium break-words"
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  )
}

function BadgeGroup(props: {
  items: Record<string, string>
  emptyText: string
  variant?: 'secondary' | 'outline'
}) {
  const { items, emptyText, variant = 'secondary' } = props

  if (Object.keys(items).length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(items).map(([key, value]) => (
        <Badge
          key={key}
          variant={variant}
          className="max-w-full text-xs font-normal break-all"
        >
          {key}: {value}
        </Badge>
      ))}
    </div>
  )
}

function ResourceBadges(props: {
  value: DeploymentOverviewViewModel['resourceRequests']
  emptyText: string
}) {
  const { value, emptyText } = props

  if (!value.cpu && !value.memory) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {value.cpu ? <Badge variant="secondary">CPU: {value.cpu}</Badge> : null}
      {value.memory ? (
        <Badge variant="secondary">Memory: {value.memory}</Badge>
      ) : null}
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
  const notSetText = t('deploymentOverview.notSet')

  return (
    <Card className="gap-0">
      <CardHeader className="border-b pb-4">
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
      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              {t('deploymentOverview.currentStatus')}
            </Label>
            <div
              className="mt-1 flex items-center gap-2 text-sm font-medium"
              data-testid="deployment-status"
            >
              <DeploymentStatusIcon
                status={overview.status}
                className="h-4 w-4"
                showAnimation={false}
              />
              <span>{overview.status}</span>
            </div>
          </div>
          <InfoItem
            label={t('deploymentOverview.readySpec')}
            value={`${overview.readyReplicas} / ${overview.specReplicas}`}
            testId="deployment-ready-spec"
          />
          <InfoItem
            label={t('detail.fields.created')}
            value={
              overview.createdAt
                ? `${formatDate(overview.createdAt)} (${formatRelativeTimeStrict(overview.createdAt)})`
                : notSetText
            }
          />
        </div>

        {!overview.isObserved ? (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100">
            {t('deploymentOverview.rolloutPendingDescription', {
              observed: overview.observedGeneration ?? 0,
              generation: overview.generation ?? 0,
            })}
          </div>
        ) : null}

        <div className="grid gap-x-8 gap-y-5 border-t pt-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem
            label={t('detail.fields.strategy')}
            value={overview.strategy}
            testId="deployment-strategy"
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
            value={overview.schedulerName || notSetText}
            testId="deployment-scheduler"
          />
          <InfoItem
            label={t('detail.fields.selector')}
            value={
              <BadgeGroup
                items={overview.selectorLabels}
                emptyText={notSetText}
              />
            }
          />
          <InfoItem
            label={t('deploymentOverview.resourceRequests')}
            value={
              <ResourceBadges
                value={overview.resourceRequests}
                emptyText={notSetText}
              />
            }
          />
          <InfoItem
            label={t('deploymentOverview.resourceLimits')}
            value={
              <ResourceBadges
                value={overview.resourceLimits}
                emptyText={notSetText}
              />
            }
          />
        </div>

        <div className="grid gap-x-8 gap-y-5 border-t pt-5 md:grid-cols-2">
          <InfoItem
            label={t('detail.fields.labels')}
            value={
              <BadgeGroup
                items={overview.labels || {}}
                emptyText={notSetText}
                variant="outline"
              />
            }
          />
          <InfoItem
            label={t('detail.fields.annotations')}
            value={
              <BadgeGroup
                items={overview.annotations || {}}
                emptyText={notSetText}
                variant="outline"
              />
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}
