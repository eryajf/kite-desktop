import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import type { Namespace, ResourceQuota } from 'kubernetes-types/core/v1'
import { Copy, Edit3, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useResources } from '@/lib/api'
import { copyTextToClipboard } from '@/lib/desktop'
import {
  findPrimaryResourceQuota,
  getNamespaceQuotaSummary,
  getResourceQuotasForNamespace,
} from '@/lib/namespace-utils'
import { getAge } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { NamespaceCreateDialog } from '@/components/editors/namespace-create-dialog'
import { NamespaceEditDialog } from '@/components/editors/namespace-edit-dialog'
import { NamespaceMetadataDialog } from '@/components/editors/namespace-metadata-dialog'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

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
            count={Object.keys(row.original.metadata?.labels || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.labels
            )}
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
            count={Object.keys(row.original.metadata?.annotations || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.annotations
            )}
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

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (namespace: Namespace): RowContextMenuItem<Namespace>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => navigate(`/namespaces/${namespace.metadata?.name}?tab=yaml`),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(namespace.metadata?.name || ''),
      },
      { type: 'separator', key: 'metadata-actions-separator' },
      {
        key: 'manage-labels',
        label: t('namespaceList.manageLabels'),
        icon: <Tags className="h-4 w-4" />,
        onSelect: () => setLabelsNamespace(namespace),
      },
      {
        key: 'manage-annotations',
        label: t('namespaceList.manageAnnotations'),
        icon: <FileText className="h-4 w-4" />,
        onSelect: () => setAnnotationsNamespace(namespace),
      },
      { type: 'separator', key: 'namespace-operations-separator' },
      {
        key: 'edit-namespace',
        label: t('namespaceList.editQuota', '配额编辑'),
        icon: <Edit3 className="h-4 w-4" />,
        onSelect: () => setEditingNamespace(namespace),
      },
    ],
    [handleCopy, navigate, t]
  )

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
        getRowContextMenuItems={getRowContextMenuItems}
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
