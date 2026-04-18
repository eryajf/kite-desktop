import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import type { Namespace } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { getAge } from '@/lib/utils'
import { NamespaceCreateDialog } from '@/components/editors/namespace-create-dialog'
import { ResourceTable } from '@/components/resource-table'

export function NamespaceListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  // Definecolumn helper outside of any hooks
  const columnHelper = createColumnHelper<Namespace>()

  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link to={`/namespaces/${row.original.metadata!.name}`}>
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('status.phase', {
        header: t('common.status'),
        cell: ({ row }) => row.original.status!.phase || 'Unknown',
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        header: t('common.created'),
        cell: ({ getValue }) => {
          return getAge(getValue() as string)
        },
      }),
    ],
    [columnHelper, t]
  )

  const filter = useCallback((ns: Namespace, query: string) => {
    return ns.metadata!.name!.toLowerCase().includes(query)
  }, [])

  const handleCreateSuccess = (namespace: Namespace) => {
    const namespaceName = namespace.metadata?.name
    if (!namespaceName) {
      return
    }
    navigate(`/namespaces/${namespaceName}`)
  }

  return (
    <>
      <ResourceTable
        resourceName="Namespaces"
        columns={columns}
        clusterScope={true}
        searchQueryFilter={filter}
        showCreateButton={true}
        onCreateClick={() => setIsCreateDialogOpen(true)}
      />

      <NamespaceCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />
    </>
  )
}
