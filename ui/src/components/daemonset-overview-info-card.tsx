import { AlertCircle, CheckCircle2, Clock3, Radar } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DaemonSetOverviewViewModel } from '@/types/k8s'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'

import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'

function InfoItem(props: {
  label: string
  value: React.ReactNode
  testId?: string
}) {
  const { label, value, testId } = props

  return (
    <div>
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
  value: DaemonSetOverviewViewModel['resourceRequests']
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

function StatusIcon(props: { status: DaemonSetOverviewViewModel['status'] }) {
  const { status } = props

  if (status === 'Available') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  }

  if (status === 'Pending') {
    return <Radar className="h-4 w-4 text-sky-600" />
  }

  if (status === 'Progressing') {
    return <Clock3 className="h-4 w-4 text-amber-600" />
  }

  return <AlertCircle className="h-4 w-4 text-rose-600" />
}

function formatRollingUpdateValue(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  return String(value)
}

export function DaemonSetOverviewInfoCard(props: {
  overview: DaemonSetOverviewViewModel
}) {
  const { overview } = props
  const { t } = useTranslation()
  const notSetText = t('daemonSetOverview.notSet')

  return (
    <Card className="gap-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>{t('detail.sections.daemonSetInformation')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem
            label={t('daemonSetOverview.currentStatus')}
            value={
              <div
                className="flex items-center gap-2"
                data-testid="daemonset-status"
              >
                <StatusIcon status={overview.status} />
                <span>{overview.status}</span>
              </div>
            }
          />
          <InfoItem
            label={t('daemonSetOverview.scheduledSummary')}
            value={`${overview.readyScheduled} / ${overview.desiredScheduled} / ${overview.currentScheduled}`}
            testId="daemonset-scheduled-summary"
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
            {t('daemonSetOverview.rolloutPendingDescription', {
              observed: overview.observedGeneration ?? 0,
              generation: overview.generation ?? 0,
            })}
          </div>
        ) : null}

        <div className="grid gap-x-8 gap-y-5 border-t pt-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem
            label={t('detail.fields.updateStrategy')}
            value={overview.updateStrategy}
            testId="daemonset-update-strategy"
          />
          <InfoItem
            label={t('daemonSetOverview.rollingUpdatePolicy')}
            value={`MaxUnavailable: ${formatRollingUpdateValue(
              overview.maxUnavailable
            )} / MaxSurge: ${formatRollingUpdateValue(overview.maxSurge)}`}
            testId="daemonset-rolling-update-policy"
          />
          <InfoItem
            label={t('daemonSetOverview.minReadySeconds')}
            value={String(overview.minReadySeconds)}
            testId="daemonset-min-ready-seconds"
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

        <div className="grid gap-x-8 gap-y-5 border-t pt-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem
            label={t('daemonSetOverview.updatedScheduled')}
            value={String(overview.updatedScheduled)}
            testId="daemonset-updated-scheduled"
          />
          <InfoItem
            label={t('daemonSetOverview.availableScheduled')}
            value={String(overview.availableScheduled)}
            testId="daemonset-available-scheduled"
          />
          <InfoItem
            label={t('daemonSetOverview.misscheduled')}
            value={String(overview.misscheduled)}
            testId="daemonset-misscheduled"
          />
          <InfoItem
            label={t('daemonSetOverview.revisionHistoryLimit')}
            value={
              overview.revisionHistoryLimit === undefined
                ? notSetText
                : String(overview.revisionHistoryLimit)
            }
            testId="daemonset-revision-history-limit"
          />
          <InfoItem
            label={t('deploymentOverview.hostNetwork')}
            value={
              overview.hostNetwork
                ? t('deploymentOverview.enabled')
                : t('deploymentOverview.disabled')
            }
            testId="daemonset-host-network"
          />
          <InfoItem
            label={t('deploymentOverview.scheduler')}
            value={overview.schedulerName || notSetText}
            testId="daemonset-scheduler"
          />
          <InfoItem
            label={t('deploymentOverview.serviceLinks')}
            value={
              overview.serviceLinksEnabled
                ? t('deploymentOverview.enabled')
                : t('deploymentOverview.disabled')
            }
            testId="daemonset-service-links"
          />
          <InfoItem
            label={t('daemonSetOverview.collisionCount')}
            value={
              overview.collisionCount === undefined
                ? notSetText
                : String(overview.collisionCount)
            }
            testId="daemonset-collision-count"
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
