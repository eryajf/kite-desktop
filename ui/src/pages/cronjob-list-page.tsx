import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { CronJob } from 'kubernetes-types/batch/v1'
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

function mergeCronJobMetadata(
  cronjob: CronJob,
  type: 'labels' | 'annotations'
) {
  return {
    ...(cronjob.metadata?.[type] || {}),
    ...(cronjob.spec?.jobTemplate?.metadata?.[type] || {}),
    ...(cronjob.spec?.jobTemplate?.spec?.template?.metadata?.[type] || {}),
  }
}

function getSuspendBadge(cronjob: CronJob) {
  const isSuspended = cronjob.spec?.suspend ?? false
  return {
    labelKey: isSuspended ? 'cronjobs.suspended' : 'cronjobs.active',
    variant: isSuspended ? ('secondary' as const) : ('default' as const),
  }
}

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

export function CronJobListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsCronJob, setLabelsCronJob] = useState<CronJob | null>(null)
  const [annotationsCronJob, setAnnotationsCronJob] = useState<CronJob | null>(
    null
  )
  const [deleteCronJobTarget, setDeleteCronJobTarget] =
    useState<CronJob | null>(null)
  const columnHelper = useMemo(() => createColumnHelper<CronJob>(), [])

  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/cronjobs/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'schedule',
        header: t('cronjobs.schedule'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.spec?.schedule || '-'}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'suspend',
        header: t('cronjobs.state'),
        cell: ({ row }) => {
          const badge = getSuspendBadge(row.original)
          return <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
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
            count={
              Object.keys(mergeCronJobMetadata(row.original, 'labels')).length
            }
            tooltipContent={renderMetadataTooltipContent(
              mergeCronJobMetadata(row.original, 'labels')
            )}
            onClick={() => setLabelsCronJob(row.original)}
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
            count={
              Object.keys(mergeCronJobMetadata(row.original, 'annotations'))
                .length
            }
            tooltipContent={renderMetadataTooltipContent(
              mergeCronJobMetadata(row.original, 'annotations')
            )}
            onClick={() => setAnnotationsCronJob(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'containers-and-images',
        header: t('deploymentOverview.containersAndImages'),
        cell: ({ row }) => (
          <ContainerImagesSummary
            containers={
              row.original.spec?.jobTemplate?.spec?.template?.spec?.containers
            }
          />
        ),
      }),
      columnHelper.display({
        id: 'resource-limits',
        header: t('deploymentOverview.resourceLimits'),
        cell: ({ row }) => (
          <ResourceLimitsSummary
            containers={
              row.original.spec?.jobTemplate?.spec?.template?.spec?.containers
            }
          />
        ),
      }),
      columnHelper.display({
        id: 'active',
        header: t('cronjobs.activeJobs'),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.status?.active?.length || 0}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'lastSchedule',
        header: t('cronjobs.lastSchedule'),
        cell: ({ row }) => {
          const lastSchedule = row.original.status?.lastScheduleTime
          if (!lastSchedule) {
            return <span className="text-sm text-muted-foreground">-</span>
          }
          return (
            <span className="text-sm text-muted-foreground">
              {formatDate(lastSchedule)}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'lastSuccess',
        header: t('cronjobs.lastSuccess'),
        cell: ({ row }) => {
          const lastSuccess = row.original.status?.lastSuccessfulTime
          if (!lastSuccess) {
            return <span className="text-sm text-muted-foreground">-</span>
          }
          return (
            <span className="text-sm text-muted-foreground">
              {formatDate(lastSuccess)}
            </span>
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

  const cronJobSearchFilter = useCallback((cronjob: CronJob, query: string) => {
    const lowerQuery = query.toLowerCase()
    const name = cronjob.metadata?.name?.toLowerCase() || ''
    const namespace = cronjob.metadata?.namespace?.toLowerCase() || ''
    const schedule = cronjob.spec?.schedule?.toLowerCase() || ''
    return (
      name.includes(lowerQuery) ||
      namespace.includes(lowerQuery) ||
      schedule.includes(lowerQuery) ||
      [
        cronjob.metadata?.labels,
        cronjob.metadata?.annotations,
        cronjob.spec?.jobTemplate?.metadata?.labels,
        cronjob.spec?.jobTemplate?.metadata?.annotations,
        cronjob.spec?.jobTemplate?.spec?.template?.metadata?.labels,
        cronjob.spec?.jobTemplate?.spec?.template?.metadata?.annotations,
      ].some((items) =>
        Object.entries(items || {}).some(([key, value]) =>
          `${key}=${value}`.toLowerCase().includes(lowerQuery)
        )
      ) ||
      (cronjob.spec?.jobTemplate?.spec?.template?.spec?.containers || []).some(
        (container) =>
          container.name.toLowerCase().includes(lowerQuery) ||
          (container.image || '').toLowerCase().includes(lowerQuery)
      )
    )
  }, [])

  const getCronJobDetailPath = useCallback((cronjob: CronJob) => {
    return `/cronjobs/${cronjob.metadata!.namespace}/${cronjob.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (cronjob: CronJob): RowContextMenuItem<CronJob>[] => {
      const detailPath = getCronJobDetailPath(cronjob)

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
          onSelect: () => handleCopy(cronjob.metadata?.name || ''),
        },
        {
          key: 'copy-namespace',
          label: t('common.copyNamespace', 'Copy namespace'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(cronjob.metadata?.namespace || ''),
        },
        { type: 'separator', key: 'metadata-actions-separator' },
        {
          key: 'manage-labels',
          label: t('common.manageLabels', 'Manage labels'),
          icon: <Tags className="h-4 w-4" />,
          onSelect: () => setLabelsCronJob(cronjob),
        },
        {
          key: 'manage-annotations',
          label: t('common.manageAnnotations', 'Manage annotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsCronJob(cronjob),
        },
        {
          key: 'delete-cronjob',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteCronJobTarget(cronjob),
        },
      ]
    },
    [getCronJobDetailPath, handleCopy, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName="CronJobs"
        resourceType="cronjobs"
        columns={columns}
        searchQueryFilter={cronJobSearchFilter}
        getRowContextMenuItems={getRowContextMenuItems}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsCronJob)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsCronJob(null)
          }
        }}
        resourceType="cronjobs"
        resource={labelsCronJob}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsCronJob)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsCronJob(null)
          }
        }}
        resourceType="cronjobs"
        resource={annotationsCronJob}
        type="annotations"
      />

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteCronJobTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteCronJobTarget(null)
          }
        }}
        resourceName={deleteCronJobTarget?.metadata?.name || ''}
        resourceType="cronjobs"
        namespace={deleteCronJobTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
