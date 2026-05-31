import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Pod } from 'kubernetes-types/core/v1'
import {
  FileCode2,
  FileText,
  Logs,
  Tags,
  TerminalSquare,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { useTerminal } from '@/contexts/terminal-context'
import { PodWithMetrics } from '@/types/api'
import { getPodStatus } from '@/lib/k8s'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { ContainerImagesSummary } from '@/components/container-images-summary'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { Badge } from '@/components/ui/badge'
import { MetricCell } from '@/components/metrics-cell'
import { PodStatusIcon } from '@/components/pod-status-icon'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceLimitsSummary } from '@/components/resource-limits-summary'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

export function PodListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { openSession } = useTerminal()
  const [labelsPod, setLabelsPod] = useState<Pod | null>(null)
  const [annotationsPod, setAnnotationsPod] = useState<Pod | null>(null)
  const [deletePodTarget, setDeletePodTarget] = useState<Pod | null>(null)
  const columnHelper = useMemo(() => createColumnHelper<PodWithMetrics>(), [])

  // Define columns for the pod table - moved outside render cycle for better performance
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/pods/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.status?.containerStatuses, {
        id: 'containers',
        header: t('pods.ready'),
        cell: ({ row }) => {
          const status = getPodStatus(row.original)
          return (
            <div>
              {status.readyContainers} / {status.totalContainers}
            </div>
          )
        },
      }),
      columnHelper.accessor((row) => row.status?.phase, {
        header: t('common.status'),
        enableColumnFilter: true,
        cell: ({ row }) => {
          const status = getPodStatus(row.original)
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <PodStatusIcon status={status.reason} />
              {status.reason}
            </Badge>
          )
        },
      }),
      columnHelper.accessor((row) => row.status, {
        id: 'restarts',
        header: t('pods.restarts'),
        cell: ({ row }) => {
          const status = getPodStatus(row.original)
          return (
            <span className="text-muted-foreground text-sm">
              {status.restartString}
            </span>
          )
        },
      }),
      columnHelper.accessor((row) => row.metrics?.cpuUsage || 0, {
        id: 'cpu',
        header: 'CPU',
        cell: ({ row }) => (
          <MetricCell metrics={row.original.metrics} type="cpu" />
        ),
      }),
      columnHelper.accessor((row) => row.metrics?.memoryUsage || 0, {
        id: 'memory',
        header: 'Memory',
        cell: ({ row }) => (
          <MetricCell metrics={row.original.metrics} type="memory" />
        ),
      }),
      columnHelper.accessor((row) => row.status?.podIP, {
        id: 'podIP',
        header: 'IP',
        cell: ({ getValue }) => {
          const ip = getValue() || '-'
          return (
            <span className="text-muted-foreground text-sm font-mono">
              {ip}
            </span>
          )
        },
      }),
      columnHelper.accessor((row) => row.spec?.nodeName, {
        id: 'nodeName',
        header: t('pods.node'),
        enableColumnFilter: true,
        cell: ({ row }) => {
          if (row.original.spec?.nodeName) {
            return (
              <div className="font-medium app-link">
                <Link to={`/nodes/${row.original.spec?.nodeName}`}>
                  {row.original.spec?.nodeName}
                </Link>
              </div>
            )
          }
          return '-'
        },
      }),
      columnHelper.display({
        id: 'labels',
        header: t('detail.fields.labels'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="labels"
            ariaLabel={t('common.manageLabels', 'Manage labels')}
            count={Object.keys(row.original.metadata?.labels || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.labels
            )}
            onClick={() => setLabelsPod(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'annotations',
        header: t('detail.fields.annotations'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="annotations"
            ariaLabel={t('common.manageAnnotations', 'Manage annotations')}
            count={Object.keys(row.original.metadata?.annotations || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.annotations
            )}
            onClick={() => setAnnotationsPod(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'containers-and-images',
        header: t('deploymentOverview.containersAndImages'),
        cell: ({ row }) => (
          <ContainerImagesSummary containers={row.original.spec?.containers} />
        ),
      }),
      columnHelper.display({
        id: 'resource-limits',
        header: t('deploymentOverview.resourceLimits'),
        cell: ({ row }) => (
          <ResourceLimitsSummary containers={row.original.spec?.containers} />
        ),
      }),
      columnHelper.accessor((row) => row.metadata?.creationTimestamp, {
        id: 'creationTimestamp',
        header: t('common.created'),
        cell: ({ getValue }) => {
          return (
            <span className="text-muted-foreground text-sm">
              {formatTimestampWithRelative(getValue())}
            </span>
          )
        },
      }),
    ],
    [columnHelper, t]
  )

  // Custom filter for pod search
  const podSearchFilter = useCallback((pod: Pod, query: string) => {
    return (
      pod.metadata?.name?.toLowerCase().includes(query) ||
      (pod.spec?.nodeName?.toLowerCase() || '').includes(query) ||
      (pod.status?.podIP?.toLowerCase() || '').includes(query) ||
      Object.entries(pod.metadata?.labels || {}).some(([key, value]) =>
        `${key}=${value}`.toLowerCase().includes(query)
      ) ||
      Object.entries(pod.metadata?.annotations || {}).some(([key, value]) =>
        `${key}=${value}`.toLowerCase().includes(query)
      ) ||
      (pod.spec?.containers || []).some(
        (container) =>
          container.name.toLowerCase().includes(query) ||
          (container.image || '').toLowerCase().includes(query)
      )
    )
  }, [])

  const getPodDetailPath = useCallback((pod: Pod) => {
    return `/pods/${pod.metadata!.namespace}/${pod.metadata!.name}`
  }, [])

  const getRowContextMenuItems = useCallback(
    (pod: Pod): RowContextMenuItem<Pod>[] => {
      const detailPath = getPodDetailPath(pod)

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=yaml`),
        },
        {
          key: 'open-terminal',
          label: t('terminalLauncher.open', 'Open terminal'),
          icon: <TerminalSquare className="h-4 w-4" />,
          onSelect: () => {
            openSession({
              type: 'pod',
              namespace: pod.metadata?.namespace,
              podName: pod.metadata?.name,
              containers: pod.spec?.containers,
              initContainers: pod.spec?.initContainers,
              source: `pod/${pod.metadata?.name}`,
              entry: 'pod-list',
            })
          },
        },
        {
          key: 'view-logs',
          label: t('detail.tabs.logs'),
          icon: <Logs className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=logs`),
        },
        { type: 'separator', key: 'metadata-actions-separator' },
        {
          key: 'manage-labels',
          label: t('common.manageLabels', 'Manage labels'),
          icon: <Tags className="h-4 w-4" />,
          onSelect: () => setLabelsPod(pod),
        },
        {
          key: 'manage-annotations',
          label: t('common.manageAnnotations', 'Manage annotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsPod(pod),
        },
        {
          key: 'delete-pod',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeletePodTarget(pod),
        },
      ]
    },
    [getPodDetailPath, navigate, openSession, t]
  )

  return (
    <>
      <ResourceTable<Pod>
        resourceName="Pods"
        columns={columns}
        clusterScope={false}
        searchQueryFilter={podSearchFilter}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsPod)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsPod(null)
          }
        }}
        resourceType="pods"
        resource={labelsPod}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsPod)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsPod(null)
          }
        }}
        resourceType="pods"
        resource={annotationsPod}
        type="annotations"
      />

      <ResourceDeleteConfirmationDialog
        open={Boolean(deletePodTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletePodTarget(null)
          }
        }}
        resourceName={deletePodTarget?.metadata?.name || ''}
        resourceType="pods"
        namespace={deletePodTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
