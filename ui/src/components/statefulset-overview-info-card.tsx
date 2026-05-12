import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  PauseCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatefulSetOverviewViewModel } from '@/types/k8s'
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
  value: StatefulSetOverviewViewModel['resourceRequests']
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

function formatRetentionPolicy(
  whenDeleted: string | undefined,
  whenScaled: string | undefined,
  emptyText: string
) {
  if (!whenDeleted && !whenScaled) {
    return emptyText
  }

  return `Deleted: ${whenDeleted || '-'} / Scaled: ${whenScaled || '-'}`
}

function StatusIcon(props: { status: StatefulSetOverviewViewModel['status'] }) {
  const { status } = props

  if (status === 'Available') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  }

  if (status === 'Scaled Down') {
    return <PauseCircle className="h-4 w-4 text-slate-500" />
  }

  if (status === 'Pending') {
    return <DatabaseZap className="h-4 w-4 text-sky-600" />
  }

  if (status === 'Progressing') {
    return <Clock3 className="h-4 w-4 text-amber-600" />
  }

  return <AlertCircle className="h-4 w-4 text-rose-600" />
}

export function StatefulSetOverviewInfoCard(props: {
  overview: StatefulSetOverviewViewModel
}) {
  const { overview } = props
  const { t } = useTranslation()
  const notSetText = t('statefulSetOverview.notSet')

  return (
    <Card className="gap-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>{t('detail.sections.statefulSetInformation')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem
            label={t('statefulSetOverview.currentStatus')}
            value={
              <div
                className="flex items-center gap-2"
                data-testid="statefulset-status"
              >
                <StatusIcon status={overview.status} />
                <span>{overview.status}</span>
              </div>
            }
          />
          <InfoItem
            label={t('statefulSetOverview.replicaSummary')}
            value={`${overview.readyReplicas} / ${overview.specReplicas} / ${overview.currentReplicas}`}
            testId="statefulset-replica-summary"
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

        <div className="grid gap-x-8 gap-y-5 border-t pt-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem
            label={t('detail.fields.updateStrategy')}
            value={overview.updateStrategy}
            testId="statefulset-update-strategy"
          />
          <InfoItem
            label={t('detail.fields.podManagementPolicy')}
            value={overview.podManagementPolicy}
            testId="statefulset-pod-management-policy"
          />
          <InfoItem
            label={t('statefulSetOverview.minReadySeconds')}
            value={String(overview.minReadySeconds)}
            testId="statefulset-min-ready-seconds"
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
            label={t('statefulSetOverview.currentRevision')}
            value={overview.currentRevision || notSetText}
            testId="statefulset-current-revision"
          />
          <InfoItem
            label={t('statefulSetOverview.updateRevision')}
            value={overview.updateRevision || notSetText}
            testId="statefulset-update-revision"
          />
          <InfoItem
            label={t('statefulSetOverview.pvcRetentionPolicy')}
            value={formatRetentionPolicy(
              overview.pvcWhenDeleted,
              overview.pvcWhenScaled,
              notSetText
            )}
            testId="statefulset-pvc-retention"
          />
          <InfoItem
            label={t('deploymentOverview.hostNetwork')}
            value={
              overview.hostNetwork
                ? t('deploymentOverview.enabled')
                : t('deploymentOverview.disabled')
            }
            testId="statefulset-host-network"
          />
          <InfoItem
            label={t('deploymentOverview.scheduler')}
            value={overview.schedulerName || notSetText}
            testId="statefulset-scheduler"
          />
          <InfoItem
            label={t('deploymentOverview.serviceLinks')}
            value={
              overview.serviceLinksEnabled
                ? t('deploymentOverview.enabled')
                : t('deploymentOverview.disabled')
            }
            testId="statefulset-service-links"
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
