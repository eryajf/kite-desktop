import { useMemo, useState, type ReactNode } from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  PaginationState,
  SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { IconLoader, IconTrash } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { MetricsData, PodWithMetrics } from '@/types/api'
import { deleteResource } from '@/lib/api'
import { getPodStatus } from '@/lib/k8s'
import { formatDate, translateError, translatePodStatus } from '@/lib/utils'

import {
  ContainerImagesSummary,
  toCompactImageName,
} from './container-images-summary'
import { DeleteConfirmationDialog } from './delete-confirmation-dialog'
import { DescribeDialog } from './describe-dialog'
import { MetricCell } from './metrics-cell'
import { OpenPodTerminalButton } from './open-pod-terminal-button'
import { PodStatusIcon } from './pod-status-icon'
import { ResourceTableView } from './resource-table-view'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
const arrIncludesSome: FilterFn<PodWithMetrics> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  const value = String(row.getValue(columnId) ?? '')
  return filterValue.includes(value)
}

export function PodTable(props: {
  pods?: PodWithMetrics[]
  labelSelector?: string
  isLoading?: boolean
  hiddenNode?: boolean
  showNamespace?: boolean
  title?: ReactNode
}) {
  const { t } = useTranslation()
  const { pods, isLoading, title } = props
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [podPendingDelete, setPodPendingDelete] = useState<{
    name: string
    namespace?: string
  } | null>(null)
  const columnHelper = createColumnHelper<PodWithMetrics>()

  const podColumns = useMemo(
    (): ColumnDef<PodWithMetrics>[] => [
      ...(props.showNamespace
        ? [
            columnHelper.accessor(
              (pod) => pod.metadata?.namespace || '-',
              {
                id: 'namespace',
                header: t('resourceTable.namespace'),
                cell: ({ getValue }) => (
                  <Badge variant="outline">{getValue()}</Badge>
                ),
              }
            ),
          ]
        : []),
      columnHelper.accessor((pod) => pod.metadata?.name || '-', {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }) => {
          const meta = row.original.metadata
          return (
            <div className="font-medium app-link">
              <Link to={`/pods/${meta!.namespace}/${meta!.name}`}>
                {meta!.name}
              </Link>
            </div>
          )
        },
      }),
      columnHelper.accessor((pod) => {
        const status = getPodStatus(pod)
        return status.readyContainers / Math.max(status.totalContainers, 1)
      }, {
        id: 'readyRatio',
        header: t('pods.ready'),
        cell: ({ row }) => {
          const status = getPodStatus(row.original)
          return `${status.readyContainers} / ${status.totalContainers}`
        },
      }),
      columnHelper.accessor((pod) => {
        const status = getPodStatus(pod)
        const numericRestarts = Number.parseInt(status.restartString, 10)
        return Number.isNaN(numericRestarts) ? 0 : numericRestarts
      }, {
        id: 'restarts',
        header: t('pods.restarts'),
        cell: ({ getValue }) => {
          return (
            <span className="text-muted-foreground text-sm">
              {String(getValue())}
            </span>
          )
        },
      }),
      columnHelper.accessor((pod) => getPodStatus(pod).reason, {
        id: 'status',
        header: t('common.status'),
        cell: ({ getValue }) => {
          const status = getValue()
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <PodStatusIcon status={status} />
              {translatePodStatus(status, t)}
            </Badge>
          )
        },
      }),
      columnHelper.accessor(
        (pod) =>
          pod.spec?.containers
            ?.map((container) =>
              `${container.name}: ${toCompactImageName(container.image || '-')}`
            )
            .join(' | ') || '-',
        {
          id: 'imageSummary',
          header: t('containerEditor.tabs.image'),
          cell: ({ row }) => (
            <ContainerImagesSummary containers={row.original.spec?.containers} />
          ),
        }
      ),
      columnHelper.accessor((pod) => pod.metrics, {
        id: 'cpu',
        header: t('monitoring.cpuUsage'),
        cell: ({ getValue }) => {
          return <MetricCell type="cpu" metrics={getValue() as MetricsData} />
        },
        enableSorting: false,
        enableColumnFilter: false,
      }),
      columnHelper.accessor((pod) => pod.metrics, {
        id: 'memory',
        header: t('monitoring.memoryUsage'),
        cell: ({ getValue }) => {
          return (
            <MetricCell type="memory" metrics={getValue() as MetricsData} />
          )
        },
        enableSorting: false,
        enableColumnFilter: false,
      }),
      columnHelper.accessor((pod) => pod.status?.podIP || '-', {
        id: 'podIP',
        header: t('detail.fields.podIP'),
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground font-mono">
            {getValue()}
          </span>
        ),
      }),
      ...(props.hiddenNode
        ? []
        : [
            columnHelper.accessor((pod) => pod.spec?.nodeName || '-', {
              id: 'node',
              header: t('pods.node'),
              cell: ({ getValue }) => (
                <Link to={`/nodes/${getValue()}`} className="app-link">
                  {getValue()}
                </Link>
              ),
            }),
          ]),
      columnHelper.accessor((pod) => pod.metadata?.creationTimestamp || '', {
        id: 'created',
        header: t('common.created'),
        cell: ({ getValue }) => {
          return (
            <span className="text-muted-foreground text-sm">
              {formatDate(getValue(), true)}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => {
          const pod = row.original
          const podName = pod.metadata?.name || ''
          const namespace = pod.metadata?.namespace

          return (
            <div className="flex items-center justify-center gap-2">
              <DescribeDialog
                resourceType="pods"
                namespace={namespace}
                name={podName}
              />
              <OpenPodTerminalButton
                pod={pod}
                source={`pod/${podName}`}
                iconOnly
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
        enableSorting: false,
        enableColumnFilter: false,
      }),
    ],
    [columnHelper, props.hiddenNode, props.showNamespace, t]
  )

  const memoizedPods = useMemo(() => pods || [], [pods])

  const columnsWithFilterFn = useMemo(
    () =>
      podColumns.map((column) => {
        if (column.id === 'actions') {
          return column
        }

        return {
          ...column,
          filterFn: column.filterFn ?? arrIncludesSome,
        }
      }),
    [podColumns]
  )

  const table = useReactTable({
    data: memoizedPods,
    columns: columnsWithFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getRowId: (row) =>
      row.metadata?.uid ||
      `${row.metadata?.namespace || '_all'}/${row.metadata?.name || 'pod'}`,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    autoResetPageIndex: false,
  })

  const filteredRowCount = table.getFilteredRowModel().rows.length
  const totalRowCount = memoizedPods.length

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
        <ResourceTableView
          table={table}
          columnCount={podColumns.length}
          isLoading={Boolean(isLoading)}
          data={memoizedPods}
          emptyState={null}
          hasActiveFilters={columnFilters.length > 0}
          filteredRowCount={filteredRowCount}
          totalRowCount={totalRowCount}
          searchQuery=""
          pagination={pagination}
          setPagination={setPagination}
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
