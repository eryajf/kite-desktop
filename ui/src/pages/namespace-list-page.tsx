import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import type { Namespace, ResourceQuota } from 'kubernetes-types/core/v1'
import { Edit3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { useResources } from '@/lib/api'
import {
  findPrimaryResourceQuota,
  getNamespaceQuotaSummary,
  getResourceQuotasForNamespace,
} from '@/lib/namespace-utils'
import { getAge } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MetadataActionButton } from '@/components/metadata-action-button'
import { NamespaceCreateDialog } from '@/components/editors/namespace-create-dialog'
import { NamespaceEditDialog } from '@/components/editors/namespace-edit-dialog'
import { NamespaceMetadataDialog } from '@/components/editors/namespace-metadata-dialog'
import { ResourceTable } from '@/components/resource-table'

export function NamespaceListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingNamespace, setEditingNamespace] = useState<Namespace | null>(
    null
  )
  const [labelsNamespace, setLabelsNamespace] = useState<Namespace | null>(null)
  const [annotationsNamespace, setAnnotationsNamespace] =
    useState<Namespace | null>(null)
  const columnHelper = createColumnHelper<Namespace>()

  const { data: resourceQuotas = [] } = useResources('resourcequotas', '_all', {
    refreshInterval: 10000,
  })

  const resourceQuotaMap = useMemo(() => {
    return resourceQuotas.reduce<Record<string, ResourceQuota[]>>(
      (acc, quota) => {
        const namespace = quota.metadata?.namespace
        if (!namespace) {
          return acc
        }

        if (!acc[namespace]) {
          acc[namespace] = []
        }
        acc[namespace].push(quota)
        return acc
      },
      {}
    )
  }, [resourceQuotas])

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
        meta: { align: 'left' },
        cell: ({ row }) => row.original.status!.phase || 'Unknown',
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        header: t('common.created'),
        cell: ({ getValue }) => getAge(getValue() as string),
      }),
      columnHelper.display({
        id: 'labels',
        header: t('detail.fields.labels'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="labels"
            ariaLabel={t('namespaceList.manageLabels')}
            onClick={() => setLabelsNamespace(row.original)}
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
            ariaLabel={t('namespaceList.manageAnnotations')}
            onClick={() => setAnnotationsNamespace(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'cpu-limit',
        header: t('resourceEditor.cpuLimit'),
        cell: ({ row }) => {
          const namespaceName = row.original.metadata?.name || ''
          const quotas = resourceQuotaMap[namespaceName] || []

          if (quotas.length > 1) {
            return (
              <Badge variant="secondary">
                {t('namespaceEditDialog.multiple', {
                  defaultValue: 'Multiple',
                })}
              </Badge>
            )
          }

          const summary = getNamespaceQuotaSummary(quotas[0])
          return summary.cpuLimit || '-'
        },
      }),
      columnHelper.display({
        id: 'memory-limit',
        header: t('resourceEditor.memoryLimit'),
        cell: ({ row }) => {
          const namespaceName = row.original.metadata?.name || ''
          const quotas = resourceQuotaMap[namespaceName] || []

          if (quotas.length > 1) {
            return (
              <Badge variant="secondary">
                {t('namespaceEditDialog.multiple', {
                  defaultValue: 'Multiple',
                })}
              </Badge>
            )
          }

          const summary = getNamespaceQuotaSummary(quotas[0])
          return summary.memoryLimit || '-'
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('common.actions', 'Actions'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingNamespace(row.original)}
            >
              <Edit3 className="h-4 w-4" />
              {t('common.edit', 'Edit')}
            </Button>
          </div>
        ),
      }),
    ],
    [columnHelper, resourceQuotaMap, t]
  )

  const filter = useCallback((ns: Namespace, query: string) => {
    const metadataValues = [
      ns.metadata?.name || '',
      ...Object.keys(ns.metadata?.labels || {}),
      ...Object.values(ns.metadata?.labels || {}),
      ...Object.keys(ns.metadata?.annotations || {}),
      ...Object.values(ns.metadata?.annotations || {}),
    ]

    return metadataValues.some((value) => value.toLowerCase().includes(query))
  }, [])

  const handleCreateSuccess = (namespace: Namespace) => {
    const namespaceName = namespace.metadata?.name
    if (!namespaceName) {
      return
    }
    navigate(`/namespaces/${namespaceName}`)
  }

  const editingNamespaceQuotas = editingNamespace
    ? getResourceQuotasForNamespace(editingNamespace, resourceQuotas)
    : []
  const editingResourceQuota = editingNamespace
    ? findPrimaryResourceQuota(editingNamespace, resourceQuotas)
    : null

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

      <NamespaceEditDialog
        open={Boolean(editingNamespace)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingNamespace(null)
          }
        }}
        namespace={editingNamespace}
        resourceQuota={editingResourceQuota}
        hasMultipleResourceQuotas={editingNamespaceQuotas.length > 1}
      />

      <NamespaceMetadataDialog
        open={Boolean(labelsNamespace)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsNamespace(null)
          }
        }}
        namespace={labelsNamespace}
        type="labels"
      />

      <NamespaceMetadataDialog
        open={Boolean(annotationsNamespace)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsNamespace(null)
          }
        }}
        namespace={annotationsNamespace}
        type="annotations"
      />
    </>
  )
}
