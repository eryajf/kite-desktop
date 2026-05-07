import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Secret } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

export function SecretListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsSecret, setLabelsSecret] = useState<Secret | null>(null)
  const [annotationsSecret, setAnnotationsSecret] = useState<Secret | null>(
    null
  )
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Secret>()

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
      columnHelper.accessor('data', {
        header: t('secrets.dataKeys'),
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

  // Custom filter for secret search
  const secretSearchFilter = useCallback((secret: Secret, query: string) => {
    const dataKeys = Object.keys(secret.data || {}).join(' ')
    const type = secret.type || ''

    return (
      secret.metadata!.name!.toLowerCase().includes(query) ||
      (secret.metadata!.namespace?.toLowerCase() || '').includes(query) ||
      type.toLowerCase().includes(query) ||
      dataKeys.toLowerCase().includes(query)
    )
  }, [])

  const getSecretDetailPath = useCallback((secret: Secret) => {
    return `/secrets/${secret.metadata!.namespace}/${secret.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (secret: Secret): RowContextMenuItem<Secret>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => navigate(`${getSecretDetailPath(secret)}?tab=yaml`),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(secret.metadata?.name || ''),
      },
      {
        key: 'copy-namespace',
        label: t('common.copyNamespace', 'Copy namespace'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(secret.metadata?.namespace || ''),
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
    ],
    [getSecretDetailPath, handleCopy, navigate, t]
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
    </>
  )
}
