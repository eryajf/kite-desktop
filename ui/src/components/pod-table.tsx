import { useMemo, useState, type ReactNode } from 'react'
import { IconLoader, IconTrash } from '@tabler/icons-react'
import { Pod } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { MetricsData, PodWithMetrics } from '@/types/api'
import { deleteResource } from '@/lib/api'
import { getPodStatus } from '@/lib/k8s'
import { formatDate, translateError, translatePodStatus } from '@/lib/utils'

import { DeleteConfirmationDialog } from './delete-confirmation-dialog'
import { DescribeDialog } from './describe-dialog'
import { MetricCell } from './metrics-cell'
import { PodStatusIcon } from './pod-status-icon'
import { Column, SimpleTable } from './simple-table'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

type PodImageEntry = {
  name: string
  image: string
}

function toCompactImageName(image: string) {
  if (!image || image === '-') return '-'

  const digestIndex = image.lastIndexOf('@')
  if (digestIndex >= 0) {
    return image.slice(image.lastIndexOf('/') + 1)
  }

  const lastSlashIndex = image.lastIndexOf('/')
  return lastSlashIndex >= 0 ? image.slice(lastSlashIndex + 1) : image
}

export function PodTable(props: {
  pods?: PodWithMetrics[]
  labelSelector?: string
  isLoading?: boolean
  hiddenNode?: boolean
  title?: ReactNode
}) {
  const { t } = useTranslation()
  const { pods, isLoading, title } = props
  const [podPendingDelete, setPodPendingDelete] = useState<{
    name: string
    namespace?: string
  } | null>(null)

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
        header: t('containerEditor.tabs.image'),
        accessor: (pod: Pod) =>
          pod.spec?.containers?.map((container) => ({
            name: container.name,
            image: container.image || '-',
          })) || [],
        cell: (value: unknown) => {
          const images = value as PodImageEntry[]

          if (images.length === 0) {
            return <span className="text-sm text-muted-foreground">-</span>
          }

          const summary = images
            .map((entry) => `${entry.name}: ${toCompactImageName(entry.image)}`)
            .join(' | ')

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="max-w-[320px] truncate text-xs text-muted-foreground"
                  title={summary}
                >
                  <span className="font-mono">{summary}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-md">
                <div className="space-y-2">
                  {images.map((entry) => (
                    <div
                      key={`${entry.name}-${entry.image}`}
                      className="min-w-0"
                    >
                      <div className="text-xs text-muted-foreground">
                        {entry.name}
                      </div>
                      <div className="font-mono text-xs break-all">
                        {entry.image}
                      </div>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        },
        align: 'left' as const,
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
      {
        header: t('common.actions'),
        accessor: (pod: Pod) => pod,
        cell: (value: unknown) => {
          const pod = value as Pod
          const podName = pod.metadata?.name || ''
          const namespace = pod.metadata?.namespace

          return (
            <div className="flex items-center justify-center gap-2">
              <DescribeDialog
                resourceType="pods"
                namespace={namespace}
                name={podName}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  setPodPendingDelete({
                    name: podName,
                    namespace,
                  })
                }
                disabled={!podName}
              >
                <IconTrash className="h-4 w-4" />
                {t('detail.buttons.delete')}
              </Button>
            </div>
          )
        },
      },
    ],
    [props.hiddenNode, t]
  )

  const handleDelete = async (force?: boolean, wait?: boolean) => {
    const targetPod = podPendingDelete
    if (!targetPod) return

    setPodPendingDelete(null)
    try {
      await deleteResource('pods', targetPod.name, targetPod.namespace, {
        force,
        wait,
      })
      toast.success(
        t('detail.status.deleted', {
          resource: targetPod.name,
        })
      )
    } catch (error) {
      toast.error(translateError(error, t))
    }
  }

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
        <CardTitle>{title ?? t('pods.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleTable
          data={pods || []}
          columns={podColumns}
          emptyMessage={t('podTable.empty')}
          stickyFirstColumn
          stickyLastColumn
          pagination={{
            enabled: true,
            pageSize: 20,
            showPageInfo: true,
          }}
        />
      </CardContent>
      <DeleteConfirmationDialog
        open={podPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPodPendingDelete(null)
          }
        }}
        resourceName={podPendingDelete?.name || ''}
        resourceType="pod"
        namespace={podPendingDelete?.namespace}
        onConfirm={handleDelete}
        showAdditionalOptions={true}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </Card>
  )
}
