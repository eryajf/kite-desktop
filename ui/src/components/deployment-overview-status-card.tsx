import { AlertCircle, CheckCircle2, Clock3, PauseCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DeploymentOverviewViewModel } from '@/types/k8s'

import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card'

function StatusIcon(props: { status: DeploymentOverviewViewModel['status'] }) {
  const { status } = props

  if (status === 'Available') {
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" />
  }

  if (status === 'Paused' || status === 'Scaled Down') {
    return <PauseCircle className="h-5 w-5 text-slate-500" />
  }

  if (status === 'Progressing') {
    return <Clock3 className="h-5 w-5 text-amber-600" />
  }

  return <AlertCircle className="h-5 w-5 text-rose-600" />
}

function Metric(props: { label: string; value: string; testId?: string }) {
  const { label, value, testId } = props

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold" data-testid={testId}>
        {value}
      </p>
    </div>
  )
}

export function DeploymentOverviewStatusCard(props: {
  overview: DeploymentOverviewViewModel
}) {
  const { overview } = props
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.sections.statusOverview')}</CardTitle>
        <CardDescription>
          {t('deploymentOverview.statusDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
          <StatusIcon status={overview.status} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('deploymentOverview.currentStatus')}
            </p>
            <p
              className="text-base font-semibold"
              data-testid="deployment-status"
            >
              {overview.status}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label={t('deploymentOverview.readySpec')}
            value={`${overview.readyReplicas} / ${overview.specReplicas}`}
            testId="deployment-ready-spec"
          />
          <Metric
            label={t('detail.fields.updatedReplicas')}
            value={String(overview.updatedReplicas)}
            testId="deployment-updated-replicas"
          />
          <Metric
            label={t('detail.fields.availableReplicas')}
            value={String(overview.availableReplicas)}
            testId="deployment-available-replicas"
          />
          <Metric
            label={t('deploymentOverview.observedGeneration')}
            value={`${overview.observedGeneration ?? 0} / ${overview.generation ?? 0}`}
            testId="deployment-observed-generation"
          />
        </div>

        {!overview.isObserved ? (
          <Alert variant="default" className="border-amber-300 bg-amber-50/60">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertTitle>
              {t('deploymentOverview.rolloutPendingTitle')}
            </AlertTitle>
            <AlertDescription>
              {t('deploymentOverview.rolloutPendingDescription', {
                observed: overview.observedGeneration ?? 0,
                generation: overview.generation ?? 0,
              })}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
