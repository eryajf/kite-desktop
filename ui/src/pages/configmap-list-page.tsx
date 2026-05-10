import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { ConfigMap } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

export function ConfigMapListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsConfigMap, setLabelsConfigMap] = useState<ConfigMap | null>(null)
  const [annotationsConfigMap, setAnnotationsConfigMap] =
    useState<ConfigMap | null>(null)
  const columnHelper = useMemo(() => createColumnHelper<ConfigMap>(), [])

  // Define columns for the configmap table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/configmaps/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('data', {
        header: t('configMaps.dataKeys'),
        cell: ({ getValue }) => {
          const data = getValue() || {}
          const keys = Object.keys(data)
          if (keys.length === 0) {
            return '-'
          }
          // Limit to first 5 keys for display
          return keys.length > 5 ? (
            <span className="text-muted-foreground">
              {keys.slice(0, 5).join(', ')}...
            </span>
          ) : (
            <span className="text-muted-foreground">{keys.join(', ')}</span>
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

  // Custom filter for configmap search
  const configMapSearchFilter = useCallback(
    (configMap: ConfigMap, query: string) => {
      const dataKeys = Object.keys(configMap.data || {}).join(' ')
      const binaryDataKeys = Object.keys(configMap.binaryData || {}).join(' ')

      return (
        configMap.metadata!.name!.toLowerCase().includes(query) ||
        (configMap.metadata!.namespace?.toLowerCase() || '').includes(query) ||
        dataKeys.toLowerCase().includes(query) ||
        binaryDataKeys.toLowerCase().includes(query)
      )
    },
    []
  )

  const getConfigMapDetailPath = useCallback((configMap: ConfigMap) => {
    return `/configmaps/${configMap.metadata!.namespace}/${configMap.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (configMap: ConfigMap): RowContextMenuItem<ConfigMap>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () =>
          navigate(`${getConfigMapDetailPath(configMap)}?tab=yaml`),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(configMap.metadata?.name || ''),
      },
      {
        key: 'copy-namespace',
        label: t('common.copyNamespace', 'Copy namespace'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(configMap.metadata?.namespace || ''),
      },
      { type: 'separator', key: 'metadata-actions-separator' },
      {
        key: 'manage-labels',
        label: t('common.manageLabels', 'Manage labels'),
        icon: <Tags className="h-4 w-4" />,
        onSelect: () => setLabelsConfigMap(configMap),
      },
      {
        key: 'manage-annotations',
        label: t('common.manageAnnotations', 'Manage annotations'),
        icon: <FileText className="h-4 w-4" />,
        onSelect: () => setAnnotationsConfigMap(configMap),
      },
    ],
    [getConfigMapDetailPath, handleCopy, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName="ConfigMaps"
        columns={columns}
        searchQueryFilter={configMapSearchFilter}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsConfigMap)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsConfigMap(null)
          }
        }}
        resourceType="configmaps"
        resource={labelsConfigMap}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsConfigMap)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsConfigMap(null)
          }
        }}
        resourceType="configmaps"
        resource={annotationsConfigMap}
        type="annotations"
      />
    </>
  )
}
