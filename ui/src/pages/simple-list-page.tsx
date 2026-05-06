import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Copy, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  clusterScopeResources,
  ResourceType,
  ResourceTypeMap,
} from '@/types/api'
import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

export interface ResourceTableProps {
  resourceType?: ResourceType
}

export function SimpleListPage<T extends keyof ResourceTypeMap>({
  resourceType,
}: ResourceTableProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsResource, setLabelsResource] = useState<ResourceTypeMap[T] | null>(
    null
  )
  const [annotationsResource, setAnnotationsResource] =
    useState<ResourceTypeMap[T] | null>(null)
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<ResourceTypeMap[T]>()
  const isClusterScope =
    resourceType && clusterScopeResources.includes(resourceType)

  // Define columns for the service table
  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.metadata?.name, {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/${resourceType}${isClusterScope ? '' : `/${row.original.metadata!.namespace}`}/${row.original.metadata!.name}`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.metadata?.creationTimestamp, {
        header: t('common.created'),
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '')

          return (
            <span className="text-muted-foreground text-sm">{dateStr}</span>
          )
        },
      }),
    ],
    [columnHelper, isClusterScope, resourceType, t]
  )

  const filter = useCallback((resource: ResourceTypeMap[T], query: string) => {
    return resource.metadata!.name!.toLowerCase().includes(query)
  }, [])

  const getResourceDetailPath = useCallback(
    (resource: ResourceTypeMap[T]) =>
      `/${resourceType}${isClusterScope ? '' : `/${resource.metadata!.namespace}`}/${resource.metadata!.name}`,
    [isClusterScope, resourceType]
  )

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (resource: ResourceTypeMap[T]): RowContextMenuItem<ResourceTypeMap[T]>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => navigate(`${getResourceDetailPath(resource)}?tab=yaml`),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(resource.metadata?.name || ''),
      },
      {
        key: 'copy-namespace',
        label: t('common.copyNamespace', 'Copy namespace'),
        icon: <Copy className="h-4 w-4" />,
        hidden: isClusterScope,
        onSelect: () => handleCopy(resource.metadata?.namespace || ''),
      },
      { type: 'separator', key: 'metadata-actions-separator' },
      {
        key: 'manage-labels',
        label: t('common.manageLabels', 'Manage labels'),
        icon: <Tags className="h-4 w-4" />,
        onSelect: () => setLabelsResource(resource),
      },
      {
        key: 'manage-annotations',
        label: t('common.manageAnnotations', 'Manage annotations'),
        icon: <FileText className="h-4 w-4" />,
        onSelect: () => setAnnotationsResource(resource),
      },
    ],
    [getResourceDetailPath, handleCopy, isClusterScope, navigate, t]
  )

  if (!resourceType) {
    return <div>Resource type "{resourceType}" not found</div>
  }

  return (
    <>
      <ResourceTable
        resourceName={resourceType}
        columns={columns}
        clusterScope={clusterScopeResources.includes(resourceType)}
        searchQueryFilter={filter}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsResource)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsResource(null)
          }
        }}
        resourceType={resourceType}
        resource={labelsResource}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsResource)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsResource(null)
          }
        }}
        resourceType={resourceType}
        resource={annotationsResource}
        type="annotations"
      />
    </>
  )
}
