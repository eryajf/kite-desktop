import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Secret } from 'kubernetes-types/core/v1'
import { FileCode2, FileText, Pencil, Tags, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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

export function SecretListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsSecret, setLabelsSecret] = useState<Secret | null>(null)
  const [annotationsSecret, setAnnotationsSecret] = useState<Secret | null>(
    null
  )
  const [deleteSecretTarget, setDeleteSecretTarget] = useState<Secret | null>(
    null
  )
  const columnHelper = useMemo(() => createColumnHelper<Secret>(), [])

  // Define columns for the secret table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/secrets/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('type', {
        header: t('common.type'),
        cell: ({ getValue }) => {
          const type = getValue() || 'Opaque'
          return <Badge variant="outline">{type}</Badge>
        },
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
            onClick={() => setLabelsSecret(row.original)}
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
            onClick={() => setAnnotationsSecret(row.original)}
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

  // Custom filter for secret search
  const secretSearchFilter = useCallback((secret: Secret, query: string) => {
    const dataKeys = Object.keys(secret.data || {}).join(' ')
    const type = secret.type || ''
    const labels = Object.entries(secret.metadata?.labels || {})
      .map(([key, value]) => `${key} ${value}`)
      .join(' ')
    const annotations = Object.entries(secret.metadata?.annotations || {})
      .map(([key, value]) => `${key} ${value}`)
      .join(' ')

    return (
      secret.metadata!.name!.toLowerCase().includes(query) ||
      (secret.metadata!.namespace?.toLowerCase() || '').includes(query) ||
      type.toLowerCase().includes(query) ||
      dataKeys.toLowerCase().includes(query) ||
      labels.toLowerCase().includes(query) ||
      annotations.toLowerCase().includes(query)
    )
  }, [])

  const getSecretDetailPath = useCallback((secret: Secret) => {
    return `/secrets/${secret.metadata!.namespace}/${secret.metadata!.name}`
  }, [])

  const getRowContextMenuItems = useCallback(
    (secret: Secret): RowContextMenuItem<Secret>[] => {
      const detailPath = getSecretDetailPath(secret)

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=yaml`),
        },
        {
          key: 'edit-secret',
          label: t('secrets.editConfig', 'Edit secret'),
          icon: <Pencil className="h-4 w-4" />,
          onSelect: () => navigate(detailPath),
        },
        { type: 'separator', key: 'metadata-actions-separator' },
        {
          key: 'manage-labels',
          label: t('common.manageLabels', 'Manage labels'),
          icon: <Tags className="h-4 w-4" />,
          onSelect: () => setLabelsSecret(secret),
        },
        {
          key: 'manage-annotations',
          label: t('common.manageAnnotations', 'Manage annotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsSecret(secret),
        },
        { type: 'separator', key: 'danger-actions-separator' },
        {
          key: 'delete-secret',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteSecretTarget(secret),
        },
      ]
    },
    [getSecretDetailPath, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName="Secrets"
        columns={columns}
        clusterScope={false} // Secrets are namespace-scoped
        searchQueryFilter={secretSearchFilter}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsSecret)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsSecret(null)
          }
        }}
        resourceType="secrets"
        resource={labelsSecret}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsSecret)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsSecret(null)
          }
        }}
        resourceType="secrets"
        resource={annotationsSecret}
        type="annotations"
      />

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteSecretTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSecretTarget(null)
          }
        }}
        resourceName={deleteSecretTarget?.metadata?.name || ''}
        resourceType="secrets"
        namespace={deleteSecretTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
