import { useCallback, useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Job } from 'kubernetes-types/batch/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'

export function JobListPage() {
  const { t } = useTranslation()
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Job>()

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
        header: t('common.created'),
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '')

          return (
            <span className="text-muted-foreground text-sm">{dateStr}</span>
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
      (job.metadata!.namespace?.toLowerCase() || '').includes(query)
    )
  }, [])

  return (
    <ResourceTable
      resourceName="Jobs"
      columns={columns}
      searchQueryFilter={jobSearchFilter}
      batchDeleteConfirmationValue={t(
        'deleteConfirmation.confirmDeleteKeyword'
      )}
    />
  )
}
