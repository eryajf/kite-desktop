import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { PersistentVolume } from 'kubernetes-types/core/v1'
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

export function PVListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsPV, setLabelsPV] = useState<PersistentVolume | null>(null)
  const [annotationsPV, setAnnotationsPV] = useState<PersistentVolume | null>(
    null
  )
  const columnHelper = createColumnHelper<PersistentVolume>()

  // Define columns for the PV table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link to={`/persistentvolumes/${row.original.metadata!.name}`}>
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('status.phase', {
        header: t('common.status'),
        enableColumnFilter: true,
        cell: ({ getValue }) => {
          const phase = getValue() || 'Unknown'
          let variant: 'default' | 'destructive' | 'secondary' = 'secondary'

          switch (phase) {
            case 'Bound':
              variant = 'default'
              break
            case 'Available':
              variant = 'secondary'
              break
            case 'Released':
            case 'Failed':
              variant = 'destructive'
              break
          }

          return <Badge variant={variant}>{phase}</Badge>
        },
      }),
      columnHelper.accessor('spec.storageClassName', {
        header: t('pvs.storageClass'),
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
        (row) => parseBytes(row.spec?.capacity?.storage || '0'),
        {
          header: t('pvs.capacity'),
          cell: ({ row }) => row.original.spec?.capacity?.storage || '-',
        }
      ),
      columnHelper.accessor('spec.accessModes', {
        header: t('pvs.accessModes'),
        cell: ({ getValue }) => {
          const modes = getValue() || []
          return modes.join(', ') || '-'
        },
      }),
      columnHelper.accessor('spec.persistentVolumeReclaimPolicy', {
        header: t('pvs.reclaimPolicy'),
        cell: ({ getValue }) => {
          const policy = getValue()
          return policy || '-'
        },
      }),
      columnHelper.accessor('spec.claimRef', {
        header: t('pvs.claim'),
        cell: ({ getValue }) => {
          const claimRef = getValue()
          if (claimRef && claimRef.name && claimRef.namespace) {
            return (
              <div className="font-medium app-link">
                <Link
                  to={`/persistentvolumeclaims/${claimRef.namespace}/${claimRef.name}`}
                >
                  {claimRef.namespace}/{claimRef.name}
                </Link>
              </div>
            )
          }
          return '-'
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

  // Custom filter for PV search
  const pvSearchFilter = useCallback((pv: PersistentVolume, query: string) => {
    return (
      pv.metadata!.name!.toLowerCase().includes(query) ||
      (pv.spec!.storageClassName?.toLowerCase() || '').includes(query) ||
      (pv.status!.phase?.toLowerCase() || '').includes(query) ||
      (pv.spec!.claimRef?.name?.toLowerCase() || '').includes(query) ||
      (pv.spec!.claimRef?.namespace?.toLowerCase() || '').includes(query)
    )
  }, [])

  const getPVDetailPath = useCallback((pv: PersistentVolume) => {
    return `/persistentvolumes/${pv.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (pv: PersistentVolume): RowContextMenuItem<PersistentVolume>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => navigate(`${getPVDetailPath(pv)}?tab=yaml`),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(pv.metadata?.name || ''),
      },
      { type: 'separator', key: 'metadata-actions-separator' },
      {
        key: 'manage-labels',
        label: t('common.manageLabels', 'Manage labels'),
        icon: <Tags className="h-4 w-4" />,
        onSelect: () => setLabelsPV(pv),
      },
      {
        key: 'manage-annotations',
        label: t('common.manageAnnotations', 'Manage annotations'),
        icon: <FileText className="h-4 w-4" />,
        onSelect: () => setAnnotationsPV(pv),
      },
    ],
    [getPVDetailPath, handleCopy, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName={'PersistentVolumes'}
        columns={columns}
        clusterScope={true}
        searchQueryFilter={pvSearchFilter}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsPV)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsPV(null)
          }
        }}
        resourceType="persistentvolumes"
        resource={labelsPV}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsPV)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsPV(null)
          }
        }}
        resourceType="persistentvolumes"
        resource={annotationsPV}
        type="annotations"
      />
    </>
  )
}
