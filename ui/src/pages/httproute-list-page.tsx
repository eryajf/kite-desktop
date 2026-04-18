import { useCallback, useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { HTTPRoute } from '@/types/gateway'
import { formatDate } from '@/lib/utils'
import { ResourceTable } from '@/components/resource-table'

export function HTTPRouteListPage() {
  const { t } = useTranslation()
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<HTTPRoute>()

  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: 'Name',
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/httproutes/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('spec.hostnames', {
        header: 'Hostnames',
        cell: ({ row }) => row.original.spec?.hostnames?.join(', ') || 'N/A',
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        header: 'Created',
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '')

          return (
            <span className="text-muted-foreground text-sm">{dateStr}</span>
          )
        },
      }),
    ],
    [columnHelper]
  )

  const filter = useCallback((ns: HTTPRoute, query: string) => {
    return ns.metadata!.name!.toLowerCase().includes(query)
  }, [])

  return (
    <ResourceTable
      resourceName="HTTPRoutes"
      columns={columns}
      searchQueryFilter={filter}
      batchDeleteConfirmationValue={t(
        'deleteConfirmation.confirmDeleteKeyword'
      )}
    />
  )
}
