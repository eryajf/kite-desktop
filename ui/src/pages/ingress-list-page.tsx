import { useCallback, useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Ingress } from 'kubernetes-types/networking/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'

export function IngressListPage() {
  const { t } = useTranslation()
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Ingress>()

  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/ingresses/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('spec.ingressClassName', {
        header: t('ingresses.ingressClass'),
        cell: ({ row }) => row.original.spec?.ingressClassName || t('common.na'),
      }),
      columnHelper.accessor('spec.rules', {
        header: t('ingresses.hosts'),
        cell: ({ row }) => {
          const rules = row.original.spec?.rules || []
          return (
            <Badge variant="outline" className="ml-2 ">
              {rules.length > 0
                ? rules.map((r) => r.host).join(', ')
                : t('common.na')}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('status.loadBalancer.ingress', {
        header: t('ingresses.loadBalancer'),
        cell: ({ row }) => {
          const ingress = row.original.status?.loadBalancer?.ingress || []
          return (
            <div>
              {ingress.length > 0
                ? ingress.map((i) => i.ip || i.hostname).join(', ')
                : t('common.na')}
            </div>
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

  const filter = useCallback((ns: Ingress, query: string) => {
    return ns.metadata!.name!.toLowerCase().includes(query)
  }, [])

  return (
    <ResourceTable
      resourceName="Ingresses"
      columns={columns}
      searchQueryFilter={filter}
      batchDeleteConfirmationValue={t(
        'deleteConfirmation.confirmDeleteKeyword'
      )}
    />
  )
}
