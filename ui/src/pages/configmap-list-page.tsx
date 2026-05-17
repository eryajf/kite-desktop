import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { ConfigMap } from 'kubernetes-types/core/v1'
import { FileCode2, FileText, Pencil, Tags, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

export function ConfigMapListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsConfigMap, setLabelsConfigMap] = useState<ConfigMap | null>(null)
  const [annotationsConfigMap, setAnnotationsConfigMap] =
    useState<ConfigMap | null>(null)
  const [deleteConfigMapTarget, setDeleteConfigMapTarget] =
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
      columnHelper.display({
        id: 'labels',
        header: t('detail.fields.labels'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="labels"
            ariaLabel={t('common.manageLabels', 'Manage labels')}
            count={Object.keys(row.original.metadata?.labels || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.labels
            )}
            onClick={() => setLabelsConfigMap(row.original)}
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
            count={Object.keys(row.original.metadata?.annotations || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.annotations
            )}
            onClick={() => setAnnotationsConfigMap(row.original)}
          />
        ),
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

  // Custom filter for configmap search
  const configMapSearchFilter = useCallback(
    (configMap: ConfigMap, query: string) => {
      const dataKeys = Object.keys(configMap.data || {}).join(' ')
      const binaryDataKeys = Object.keys(configMap.binaryData || {}).join(' ')
      const labels = Object.entries(configMap.metadata?.labels || {})
        .map(([key, value]) => `${key} ${value}`)
        .join(' ')
      const annotations = Object.entries(configMap.metadata?.annotations || {})
        .map(([key, value]) => `${key} ${value}`)
        .join(' ')

      return (
        configMap.metadata!.name!.toLowerCase().includes(query) ||
        (configMap.metadata!.namespace?.toLowerCase() || '').includes(query) ||
        dataKeys.toLowerCase().includes(query) ||
        binaryDataKeys.toLowerCase().includes(query) ||
        labels.toLowerCase().includes(query) ||
        annotations.toLowerCase().includes(query)
      )
    },
    []
  )

  const getConfigMapDetailPath = useCallback((configMap: ConfigMap) => {
    return `/configmaps/${configMap.metadata!.namespace}/${configMap.metadata!.name}`
  }, [])

  const getRowContextMenuItems = useCallback(
    (configMap: ConfigMap): RowContextMenuItem<ConfigMap>[] => {
      const detailPath = getConfigMapDetailPath(configMap)

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=yaml`),
        },
        {
          key: 'edit-config',
          label: t('configMaps.editConfig', 'Edit config'),
          icon: <Pencil className="h-4 w-4" />,
          onSelect: () => navigate(detailPath),
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
        { type: 'separator', key: 'danger-actions-separator' },
        {
          key: 'delete-configmap',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteConfigMapTarget(configMap),
        },
      ]
    },
    [getConfigMapDetailPath, navigate, t]
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

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteConfigMapTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfigMapTarget(null)
          }
        }}
        resourceName={deleteConfigMapTarget?.metadata?.name || ''}
        resourceType="configmaps"
        namespace={deleteConfigMapTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
