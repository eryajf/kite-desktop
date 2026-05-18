import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { PersistentVolume } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, RotateCcw, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate, formatRelativeTimeStrict, parseBytes } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { PVCreateDialog } from '@/components/editors/storage-create-dialogs'
import { PVReclaimPolicyDialog } from '@/components/editors/storage-edit-dialogs'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

export function PVListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [reclaimPolicyPV, setReclaimPolicyPV] =
    useState<PersistentVolume | null>(null)
  const [labelsPV, setLabelsPV] = useState<PersistentVolume | null>(null)
  const [annotationsPV, setAnnotationsPV] = useState<PersistentVolume | null>(
    null
  )
  const columnHelper = useMemo(() => createColumnHelper<PersistentVolume>(), [])

  const getVolumeSourceType = useCallback((pv: PersistentVolume) => {
    const spec = pv.spec
    if (spec?.csi) return 'CSI'
    if (spec?.nfs) return 'NFS'
    if (spec?.hostPath) return 'HostPath'
    if (spec?.local) return 'Local'
    if (spec?.awsElasticBlockStore) return 'AWSElasticBlockStore'
    if (spec?.gcePersistentDisk) return 'GCEPersistentDisk'
    return '-'
  }, [])

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
      columnHelper.accessor('spec.volumeMode', {
        header: t('storageDetails.volumeMode'),
        cell: ({ getValue }) => getValue() || '-',
      }),
      columnHelper.display({
        id: 'volume-source',
        header: t('storageDetails.volumeSource'),
        cell: ({ row }) => getVolumeSourceType(row.original),
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
      columnHelper.display({
        id: 'labels',
        header: t('detail.fields.labels'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="labels"
            ariaLabel={t('pvList.manageLabels')}
            count={Object.keys(row.original.metadata?.labels || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.labels
            )}
            onClick={() => setLabelsPV(row.original)}
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
            ariaLabel={t('pvList.manageAnnotations')}
            count={Object.keys(row.original.metadata?.annotations || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.annotations
            )}
            onClick={() => setAnnotationsPV(row.original)}
          />
        ),
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
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
    [columnHelper, getVolumeSourceType, t]
  )

  // Custom filter for PV search
  const pvSearchFilter = useCallback((pv: PersistentVolume, query: string) => {
    return (
      pv.metadata!.name!.toLowerCase().includes(query) ||
      (pv.spec!.storageClassName?.toLowerCase() || '').includes(query) ||
      (pv.status!.phase?.toLowerCase() || '').includes(query) ||
      (pv.spec!.volumeMode?.toLowerCase() || '').includes(query) ||
      getVolumeSourceType(pv).toLowerCase().includes(query) ||
      (pv.spec!.claimRef?.name?.toLowerCase() || '').includes(query) ||
      (pv.spec!.claimRef?.namespace?.toLowerCase() || '').includes(query)
    )
  }, [getVolumeSourceType])

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

  const handleCreateSuccess = useCallback(
    async (pv: PersistentVolume) => {
      await queryClient.invalidateQueries({
        queryKey: ['persistentvolumes'],
      })
      navigate(`/persistentvolumes/${pv.metadata?.name || ''}`)
    },
    [navigate, queryClient]
  )

  const handleEditSuccess = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['persistentvolumes'],
    })
  }, [queryClient])

  const getRowContextMenuItems = useCallback(
    (pv: PersistentVolume): RowContextMenuItem<PersistentVolume>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => navigate(`${getPVDetailPath(pv)}?tab=yaml`),
      },
      {
        key: 'edit-reclaim-policy',
        label: t('storageEdit.reclaimPolicyAction'),
        icon: <RotateCcw className="h-4 w-4" />,
        onSelect: () => setReclaimPolicyPV(pv),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(pv.metadata?.name || ''),
      },
      {
        key: 'copy-storage-class',
        label: t('pvs.copyStorageClass'),
        icon: <Copy className="h-4 w-4" />,
        disabled: !pv.spec?.storageClassName,
        onSelect: () => handleCopy(pv.spec?.storageClassName || ''),
      },
      {
        key: 'copy-claim',
        label: t('pvs.copyClaim'),
        icon: <Copy className="h-4 w-4" />,
        disabled: !pv.spec?.claimRef?.name,
        onSelect: () =>
          handleCopy(
            pv.spec?.claimRef?.namespace && pv.spec?.claimRef?.name
              ? `${pv.spec.claimRef.namespace}/${pv.spec.claimRef.name}`
              : ''
          ),
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
        showCreateButton={true}
        onCreateClick={() => setIsCreateDialogOpen(true)}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <PVCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <PVReclaimPolicyDialog
        open={Boolean(reclaimPolicyPV)}
        onOpenChange={(open) => {
          if (!open) {
            setReclaimPolicyPV(null)
          }
        }}
        pv={reclaimPolicyPV}
        onSuccess={handleEditSuccess}
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
