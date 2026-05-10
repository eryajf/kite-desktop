import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { PersistentVolumeClaim } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate, parseBytes } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

export function PVCListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsPVC, setLabelsPVC] = useState<PersistentVolumeClaim | null>(null)
  const [annotationsPVC, setAnnotationsPVC] =
    useState<PersistentVolumeClaim | null>(null)
  const columnHelper = useMemo(
    () => createColumnHelper<PersistentVolumeClaim>(),
    []
  )

  // Define columns for the pvc table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/persistentvolumeclaims/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('status.phase', {
        header: t('common.status'),
        cell: ({ getValue }) => {
          const phase = getValue() || 'Unknown'
          let variant: 'default' | 'destructive' | 'secondary' = 'secondary'

          switch (phase) {
            case 'Bound':
              variant = 'default'
              break
            case 'Lost':
              variant = 'destructive'
              break
            case 'Pending':
              variant = 'secondary'
              break
          }

          return <Badge variant={variant}>{phase}</Badge>
        },
      }),
      columnHelper.accessor('spec.volumeName', {
        header: t('pvcs.volume'),
        cell: ({ getValue }) => {
          const volumeName = getValue()
          if (volumeName) {
            return (
              <div className="font-medium app-link">
                <Link to={`/persistentvolumes/${volumeName}`}>
                  {volumeName}
                </Link>
              </div>
            )
          }
          return '-'
        },
      }),
      columnHelper.accessor('spec.storageClassName', {
        header: t('pvcs.storageClass'),
        enableColumnFilter: true,
        cell: ({ getValue }) => {
          const scName = getValue()
          if (scName) {
            return (
              <div className="font-medium app-link">
                <Link to={`/storageclasses/${scName}`}>{scName}</Link>
              </div>
            )
          }
          return '-'
        },
      }),
      columnHelper.accessor(
        (row) => parseBytes(row.spec?.resources?.requests?.storage || '0'),
        {
          header: t('pvcs.capacity'),
          cell: ({ row }) =>
            row.original.spec?.resources?.requests?.storage || '-',
        }
      ),
      columnHelper.accessor('spec.accessModes', {
        header: t('pvcs.accessModes'),
        cell: ({ getValue }) => {
          const modes = getValue() || []
          return modes.join(', ') || '-'
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

  // Custom filter for pvc search
  const pvcSearchFilter = useCallback(
    (pvc: PersistentVolumeClaim, query: string) => {
      return (
        pvc.metadata!.name!.toLowerCase().includes(query) ||
        (pvc.metadata!.namespace?.toLowerCase() || '').includes(query) ||
        (pvc.spec!.volumeName?.toLowerCase() || '').includes(query) ||
        (pvc.spec!.storageClassName?.toLowerCase() || '').includes(query) ||
        (pvc.status!.phase?.toLowerCase() || '').includes(query)
      )
    },
    []
  )

  const getPVCDetailPath = useCallback((pvc: PersistentVolumeClaim) => {
    return `/persistentvolumeclaims/${pvc.metadata!.namespace}/${pvc.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (pvc: PersistentVolumeClaim): RowContextMenuItem<PersistentVolumeClaim>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => navigate(`${getPVCDetailPath(pvc)}?tab=yaml`),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(pvc.metadata?.name || ''),
      },
      {
        key: 'copy-namespace',
        label: t('common.copyNamespace', 'Copy namespace'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(pvc.metadata?.namespace || ''),
      },
      { type: 'separator', key: 'metadata-actions-separator' },
      {
        key: 'manage-labels',
        label: t('common.manageLabels', 'Manage labels'),
        icon: <Tags className="h-4 w-4" />,
        onSelect: () => setLabelsPVC(pvc),
      },
      {
        key: 'manage-annotations',
        label: t('common.manageAnnotations', 'Manage annotations'),
        icon: <FileText className="h-4 w-4" />,
        onSelect: () => setAnnotationsPVC(pvc),
      },
    ],
    [getPVCDetailPath, handleCopy, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName={'PersistentVolumeClaims'}
        columns={columns}
        searchQueryFilter={pvcSearchFilter}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsPVC)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsPVC(null)
          }
        }}
        resourceType="persistentvolumeclaims"
        resource={labelsPVC}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsPVC)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsPVC(null)
          }
        }}
        resourceType="persistentvolumeclaims"
        resource={annotationsPVC}
        type="annotations"
      />
    </>
  )
}
