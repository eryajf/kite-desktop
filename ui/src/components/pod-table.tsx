import { useMemo } from 'react'
import { IconLoader } from '@tabler/icons-react'
import { Pod } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { MetricsData, PodWithMetrics } from '@/types/api'
import { getPodStatus } from '@/lib/k8s'
import { formatDate, translatePodStatus } from '@/lib/utils'

import { MetricCell } from './metrics-cell'
import { PodStatusIcon } from './pod-status-icon'
import { Column, SimpleTable } from './simple-table'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

export function PodTable(props: {
  pods?: PodWithMetrics[]
  labelSelector?: string
  isLoading?: boolean
  hiddenNode?: boolean
}) {
  const { t } = useTranslation()
  const { pods, isLoading } = props

  // Pod table columns
  const podColumns = useMemo(
    (): Column<PodWithMetrics>[] => [
      {
        header: t('common.name'),
        accessor: (pod: Pod) => pod.metadata,
        cell: (value: unknown) => {
          const meta = value as Pod['metadata']
          return (
            <div className="font-medium app-link">
              <Link to={`/pods/${meta!.namespace}/${meta!.name}`}>
                {meta!.name}
              </Link>
            </div>
          )
        },
        align: 'left' as const,
      },
      {
        header: t('pods.ready'),
        accessor: (pod: Pod) => {
          const status = getPodStatus(pod)
          return `${status.readyContainers} / ${status.totalContainers}`
        },
        cell: (value: unknown) => value as string,
      },
      {
        header: t('pods.restarts'),
        accessor: (pod: Pod) => {
          const status = getPodStatus(pod)
          return status.restartString || '0'
        },
        cell: (value: unknown) => {
          return (
            <span className="text-muted-foreground text-sm">
              {value as number}
            </span>
          )
        },
      },
      {
        header: t('common.status'),
        accessor: (pod: Pod) => pod,
        cell: (value: unknown) => {
          const status = getPodStatus(value as Pod)
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <PodStatusIcon status={status.reason} />
              {translatePodStatus(status.reason, t)}
            </Badge>
          )
        },
      },
      {
        header: t('monitoring.cpuUsage'),
        accessor: (pod: PodWithMetrics) => {
          return pod.metrics
        },
        cell: (value: unknown) => {
          return <MetricCell type="cpu" metrics={value as MetricsData} />
        },
      },
      {
        header: t('monitoring.memoryUsage'),
        accessor: (pod: PodWithMetrics) => {
          return pod.metrics
        },
        cell: (value: unknown) => {
          return <MetricCell type="memory" metrics={value as MetricsData} />
        },
      },
      {
        header: t('detail.fields.podIP'),
        accessor: (pod: Pod) => pod.status?.podIP || '-',
        cell: (value: unknown) => (
          <span className="text-sm text-muted-foreground font-mono">
            {value as string}
          </span>
        ),
      },
      ...(props.hiddenNode
        ? []
        : [
            {
              header: t('pods.node'),
              accessor: (pod: Pod) => pod.spec?.nodeName || '-',
              cell: (value: unknown) => (
                <Link to={`/nodes/${value}`} className="app-link">
                  {value as string}
                </Link>
              ),
            },
          ]),
      {
        header: t('common.created'),
        accessor: (pod: Pod) => pod.metadata?.creationTimestamp || '',
        cell: (value: unknown) => {
          return (
            <span className="text-muted-foreground text-sm">
              {formatDate(value as string, true)}
            </span>
          )
        },
      },
    ],
    [props.hiddenNode, t]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconLoader className="animate-spin mr-2" />
        {t('podTable.loading')}
      </div>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pods.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleTable
          data={pods || []}
          columns={podColumns}
          emptyMessage={t('podTable.empty')}
          pagination={{
            enabled: true,
            pageSize: 20,
            showPageInfo: true,
          }}
        />
      </CardContent>
    </Card>
  )
}
