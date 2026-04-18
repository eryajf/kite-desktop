import { useCallback, useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { CustomResourceDefinition } from 'kubernetes-types/apiextensions/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { getAge } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'

export function CRDListPage() {
  const { t } = useTranslation()
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<CustomResourceDefinition>()

  // Define columns for the CRD table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link to={`/crds/${row.original.metadata!.name}`}>
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('spec.group', {
        header: t('crds.group'),
        enableColumnFilter: true,
        cell: ({ getValue }) => <span className=" text-sm">{getValue()}</span>,
      }),
      columnHelper.accessor('spec.versions', {
        header: t('crds.versions'),
        cell: ({ getValue }) => {
          const versions = getValue() || []
          return (
            <div className="flex flex-wrap gap-1">
              {versions.map(
                (
                  version: {
                    name: string
                    served?: boolean
                    storage?: boolean
                  },
                  index: number
                ) => (
                  <Badge
                    key={index}
                    variant={version.served ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {version.name}
                  </Badge>
                )
              )}
            </div>
          )
        },
      }),
      columnHelper.accessor('spec.scope', {
        header: t('crds.scope'),
        cell: ({ getValue }) => (
          <Badge
            variant={getValue() === 'Namespaced' ? 'default' : 'outline'}
            className="text-xs"
          >
            {getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('status.conditions', {
        header: t('common.status'),
        cell: ({ getValue }) => {
          const conditions = getValue() || []
          const establishedCondition = conditions.find(
            (c: { type: string; status: string }) => c.type === 'Established'
          )
          const isEstablished = establishedCondition?.status === 'True'

          return (
            <Badge
              variant={isEstablished ? 'default' : 'destructive'}
              className="text-xs"
            >
              {isEstablished ? t('crds.established') : t('crds.notReady')}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        header: t('crds.age'),
        cell: ({ getValue }) => {
          return getAge(getValue() as string)
        },
      }),
    ],
    [columnHelper, t]
  )

  // Custom search filter for CRDs
  const searchQueryFilter = useCallback(
    (crd: CustomResourceDefinition, query: string) => {
      const searchFields = [
        crd.metadata?.name || '',
        crd.spec?.group || '',
        crd.spec?.scope || '',
        ...(crd.spec?.versions?.map((v: { name: string }) => v.name) || []),
      ]

      return searchFields.some((field) =>
        field.toLowerCase().includes(query.toLowerCase())
      )
    },
    []
  )

  return (
    <ResourceTable
      resourceName="Custom Resource Definitions"
      resourceType="crds"
      columns={columns}
      clusterScope={true} // CRDs are cluster-scoped
      searchQueryFilter={searchQueryFilter}
    />
  )
}
