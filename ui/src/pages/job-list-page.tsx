import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Job } from 'kubernetes-types/batch/v1'
import { Copy, FileCode2, FileText, Tags, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ContainerImagesSummary } from '@/components/container-images-summary'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
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

export function JobListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsJob, setLabelsJob] = useState<Job | null>(null)
  const [annotationsJob, setAnnotationsJob] = useState<Job | null>(null)
  const [deleteJobTarget, setDeleteJobTarget] = useState<Job | null>(null)
  // Define column helper outside of any hooks
  const columnHelper = useMemo(() => createColumnHelper<Job>(), [])

  // Define columns for the job table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/jobs/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('status.conditions', {
        header: t('common.status'),
        cell: ({ row }) => {
          const conditions = row.original.status?.conditions || []
          const completedCondition = conditions.find(
            (c) => c.type === 'Complete'
          )
          const failedCondition = conditions.find((c) => c.type === 'Failed')

          let status = t('jobs.running')
          let variant: 'default' | 'destructive' | 'secondary' = 'secondary'

          if (completedCondition?.status === 'True') {
            status = t('jobs.complete')
            variant = 'default'
          } else if (failedCondition?.status === 'True') {
            status = t('status.failed')
            variant = 'destructive'
          }

          return <Badge variant={variant}>{status}</Badge>
        },
      }),
      columnHelper.accessor((row) => row.status, {
        id: 'completions',
        header: t('jobs.completions'),
        cell: ({ row }) => {
          const status = row.original.status
          const succeeded = status?.succeeded || 0
          const completions = row.original.spec?.completions || 1
          return `${succeeded}/${completions}`
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
            onClick={() => setLabelsJob(row.original)}
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
            onClick={() => setAnnotationsJob(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'containers-and-images',
        header: t('deploymentOverview.containersAndImages'),
        cell: ({ row }) => (
          <ContainerImagesSummary
            containers={row.original.spec?.template?.spec?.containers}
          />
        ),
      }),
      columnHelper.display({
        id: 'resource-limits',
        header: t('deploymentOverview.resourceLimits'),
        cell: ({ row }) => (
          <ResourceLimitsSummary
            containers={row.original.spec?.template?.spec?.containers}
          />
        ),
      }),
      columnHelper.accessor('status.startTime', {
        header: t('jobs.started'),
        cell: ({ getValue }) => {
          const startTime = getValue()
          if (!startTime) return '-'

          const dateStr = formatDate(startTime)

          return (
            <span className="text-muted-foreground text-sm">{dateStr}</span>
          )
        },
      }),
      columnHelper.accessor('status.completionTime', {
        header: t('jobs.completed'),
        cell: ({ getValue }) => {
          const completionTime = getValue()
          if (!completionTime) return '-'

          const dateStr = formatDate(completionTime)

          return (
            <span className="text-muted-foreground text-sm">{dateStr}</span>
          )
        },
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        id: 'created',
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

  // Custom filter for job search
  const jobSearchFilter = useCallback((job: Job, query: string) => {
    return (
      job.metadata!.name!.toLowerCase().includes(query) ||
      (job.metadata!.namespace?.toLowerCase() || '').includes(query) ||
      [
        job.metadata?.labels,
        job.metadata?.annotations,
        job.spec?.template?.metadata?.labels,
        job.spec?.template?.metadata?.annotations,
      ].some((items) =>
        Object.entries(items || {}).some(([key, value]) =>
          `${key}=${value}`.toLowerCase().includes(query)
        )
      ) ||
      (job.spec?.template?.spec?.containers || []).some(
        (container) =>
          container.name.toLowerCase().includes(query) ||
          (container.image || '').toLowerCase().includes(query)
      )
    )
  }, [])

  const getJobDetailPath = useCallback((job: Job) => {
    return `/jobs/${job.metadata!.namespace}/${job.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (job: Job): RowContextMenuItem<Job>[] => {
      const detailPath = getJobDetailPath(job)

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=yaml`),
        },
        { type: 'separator', key: 'primary-actions-separator' },
        {
          key: 'copy-name',
          label: t('common.copyName', 'Copy name'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(job.metadata?.name || ''),
        },
        {
          key: 'copy-namespace',
          label: t('common.copyNamespace', 'Copy namespace'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(job.metadata?.namespace || ''),
        },
        { type: 'separator', key: 'metadata-actions-separator' },
        {
          key: 'manage-labels',
          label: t('common.manageLabels', 'Manage labels'),
          icon: <Tags className="h-4 w-4" />,
          onSelect: () => setLabelsJob(job),
        },
        {
          key: 'manage-annotations',
          label: t('common.manageAnnotations', 'Manage annotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsJob(job),
        },
        {
          key: 'delete-job',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteJobTarget(job),
        },
      ]
    },
    [getJobDetailPath, handleCopy, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName="Jobs"
        resourceType="jobs"
        columns={columns}
        searchQueryFilter={jobSearchFilter}
        getRowContextMenuItems={getRowContextMenuItems}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsJob)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsJob(null)
          }
        }}
        resourceType="jobs"
        resource={labelsJob}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsJob)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsJob(null)
          }
        }}
        resourceType="jobs"
        resource={annotationsJob}
        type="annotations"
      />

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteJobTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteJobTarget(null)
          }
        }}
        resourceName={deleteJobTarget?.metadata?.name || ''}
        resourceType="jobs"
        namespace={deleteJobTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
