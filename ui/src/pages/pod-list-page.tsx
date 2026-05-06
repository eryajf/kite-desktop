import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Pod } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { PodWithMetrics } from '@/types/api'
import { copyTextToClipboard } from '@/lib/desktop'
import { getPodStatus } from '@/lib/k8s'
import { formatDate, getAge } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MetricCell } from '@/components/metrics-cell'
import { PodStatusIcon } from '@/components/pod-status-icon'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

export function PodListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsPod, setLabelsPod] = useState<Pod | null>(null)
  const [annotationsPod, setAnnotationsPod] = useState<Pod | null>(null)
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<PodWithMetrics>()

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
      columnHelper.accessor((row) => row.metadata?.creationTimestamp, {
        id: 'creationTimestamp',
        header: t('common.created'),
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '')
          return (
            <Tooltip>
              <TooltipTrigger>
                <span className="text-muted-foreground text-sm">
                  {getAge(getValue() || '')}
                </span>
              </TooltipTrigger>
              <TooltipContent>{dateStr}</TooltipContent>
            </Tooltip>
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
      (pod.status?.podIP?.toLowerCase() || '').includes(query)
    )
  }, [])

  const getPodDetailPath = useCallback((pod: Pod) => {
    return `/pods/${pod.metadata!.namespace}/${pod.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (pod: Pod): RowContextMenuItem<Pod>[] => {
      const podIP = pod.status?.podIP

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${getPodDetailPath(pod)}?tab=yaml`),
        },
        { type: 'separator', key: 'primary-actions-separator' },
        {
          key: 'copy-name',
          label: t('common.copyName', 'Copy name'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(pod.metadata?.name || ''),
        },
        {
          key: 'copy-namespace',
          label: t('common.copyNamespace', 'Copy namespace'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(pod.metadata?.namespace || ''),
        },
        {
          key: 'copy-pod-ip',
          label: t('pods.copyPodIP', 'Copy Pod IP'),
          icon: <Copy className="h-4 w-4" />,
          disabled: !podIP,
          onSelect: () => handleCopy(podIP || ''),
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
      ]
    },
    [getPodDetailPath, handleCopy, navigate, t]
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
    </>
  )
}
