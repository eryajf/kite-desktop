import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { StorageClass } from 'kubernetes-types/storage/v1'
import {
  Copy,
  Database,
  FileCode2,
  FileText,
  ListChecks,
  Star,
  Tags,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { StorageClassCreateDialog } from '@/components/editors/storage-create-dialogs'
import {
  isDefaultStorageClass,
  setStorageClassDefault,
} from '@/components/editors/storage-edit-dialogs'
import {
  MetadataSummaryButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

const storageClassColumnHelper = createColumnHelper<StorageClass>()

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

function includesRecordText(
  values: Record<string, string> | undefined,
  query: string
) {
  return Object.entries(values || {}).some(
    ([key, value]) =>
      key.toLowerCase().includes(query) ||
      value.toLowerCase().includes(query)
  )
}

export function StorageClassListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [labelsStorageClass, setLabelsStorageClass] =
    useState<StorageClass | null>(null)
  const [annotationsStorageClass, setAnnotationsStorageClass] =
    useState<StorageClass | null>(null)

  const columns = useMemo(
    () => [
      storageClassColumnHelper.accessor((row) => row.metadata?.name, {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link to={`/storageclasses/${row.original.metadata!.name}`}>
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      storageClassColumnHelper.accessor('provisioner', {
        id: 'provisioner',
        header: t('storageClasses.provisioner'),
        cell: ({ getValue }) => (
          <span className="font-mono text-sm text-muted-foreground">
            {getValue() || '-'}
          </span>
        ),
      }),
      storageClassColumnHelper.display({
        id: 'default-class',
        header: t('storageClasses.defaultClass'),
        cell: ({ row }) => (
          <Badge variant={isDefaultStorageClass(row.original) ? 'default' : 'outline'}>
            {isDefaultStorageClass(row.original) ? t('common.yes') : t('common.no')}
          </Badge>
        ),
      }),
      storageClassColumnHelper.accessor('reclaimPolicy', {
        id: 'reclaim-policy',
        header: t('pvs.reclaimPolicy'),
        enableColumnFilter: true,
        cell: ({ getValue }) => getValue() || 'Delete',
      }),
      storageClassColumnHelper.accessor('volumeBindingMode', {
        id: 'binding-mode',
        header: t('storageClasses.volumeBindingMode'),
        enableColumnFilter: true,
        cell: ({ getValue }) => getValue() || 'Immediate',
      }),
      storageClassColumnHelper.accessor('allowVolumeExpansion', {
        id: 'allow-expansion',
        header: t('storageClasses.allowExpansion'),
        cell: ({ getValue }) => (
          <Badge variant={getValue() ? 'default' : 'outline'}>
            {getValue() ? t('common.yes') : t('common.no')}
          </Badge>
        ),
      }),
      storageClassColumnHelper.display({
        id: 'parameters',
        header: t('storageClasses.parameters'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataSummaryButton
            ariaLabel={t('storageClasses.viewParameters')}
            count={Object.keys(row.original.parameters || {}).length}
            tooltipContent={renderMetadataTooltipContent(row.original.parameters)}
          >
            <ListChecks className="h-4 w-4" />
          </MetadataSummaryButton>
        ),
      }),
      storageClassColumnHelper.display({
        id: 'mount-options',
        header: t('storageClasses.mountOptions'),
        meta: { align: 'left' },
        cell: ({ row }) => {
          const options = row.original.mountOptions || []
          return (
            <MetadataSummaryButton
              ariaLabel={t('storageClasses.viewMountOptions')}
              count={options.length}
              tooltipContent={options.length ? options.join(', ') : '-'}
            >
              <Database className="h-4 w-4" />
            </MetadataSummaryButton>
          )
        },
      }),
      storageClassColumnHelper.accessor('metadata.creationTimestamp', {
        id: 'created',
        header: t('common.created'),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground text-sm">
            {formatTimestampWithRelative(getValue())}
          </span>
        ),
      }),
    ],
    [t]
  )

  const storageClassSearchFilter = useCallback(
    (storageClass: StorageClass, query: string) => {
      const normalizedQuery = query.toLowerCase()
      return (
        storageClass.metadata!.name!.toLowerCase().includes(normalizedQuery) ||
        storageClass.provisioner.toLowerCase().includes(normalizedQuery) ||
        (storageClass.reclaimPolicy || 'Delete')
          .toLowerCase()
          .includes(normalizedQuery) ||
        (storageClass.volumeBindingMode || 'Immediate')
          .toLowerCase()
          .includes(normalizedQuery) ||
        includesRecordText(storageClass.parameters, normalizedQuery)
      )
    },
    []
  )

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const handleToggleDefault = useCallback(
    async (storageClass: StorageClass) => {
      const nextDefault = !isDefaultStorageClass(storageClass)
      try {
        await setStorageClassDefault(storageClass, nextDefault)
        await queryClient.invalidateQueries({ queryKey: ['storageclasses'] })
        toast.success(
          t(
            nextDefault
              ? 'storageEdit.setDefaultSuccess'
              : 'storageEdit.unsetDefaultSuccess',
            { name: storageClass.metadata?.name || '' }
          )
        )
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('common.error', 'Error')
        )
      }
    },
    [queryClient, t]
  )

  const getRowContextMenuItems = useCallback(
    (storageClass: StorageClass): RowContextMenuItem<StorageClass>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () =>
          navigate(`/storageclasses/${storageClass.metadata?.name}?tab=yaml`),
      },
      {
        key: isDefaultStorageClass(storageClass)
          ? 'unset-default-storage-class'
          : 'set-default-storage-class',
        label: isDefaultStorageClass(storageClass)
          ? t('storageEdit.unsetDefaultAction')
          : t('storageEdit.setDefaultAction'),
        icon: <Star className="h-4 w-4" />,
        onSelect: () => handleToggleDefault(storageClass),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(storageClass.metadata?.name || ''),
      },
      {
        key: 'copy-provisioner',
        label: t('storageClasses.copyProvisioner'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(storageClass.provisioner || ''),
      },
      { type: 'separator', key: 'metadata-actions-separator' },
      {
        key: 'manage-labels',
        label: t('common.manageLabels', 'Manage labels'),
        icon: <Tags className="h-4 w-4" />,
        onSelect: () => setLabelsStorageClass(storageClass),
      },
      {
        key: 'manage-annotations',
        label: t('common.manageAnnotations', 'Manage annotations'),
        icon: <FileText className="h-4 w-4" />,
        onSelect: () => setAnnotationsStorageClass(storageClass),
      },
    ],
    [handleCopy, handleToggleDefault, navigate, t]
  )

  const handleCreateSuccess = useCallback(
    async (storageClass: StorageClass) => {
      await queryClient.invalidateQueries({
        queryKey: ['storageclasses'],
      })
      navigate(`/storageclasses/${storageClass.metadata?.name || ''}`)
    },
    [navigate, queryClient]
  )

  return (
    <>
      <ResourceTable
        resourceName="storageclasses"
        columns={columns}
        clusterScope={true}
        searchQueryFilter={storageClassSearchFilter}
        showCreateButton={true}
        onCreateClick={() => setIsCreateDialogOpen(true)}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <StorageClassCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsStorageClass)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsStorageClass(null)
          }
        }}
        resourceType="storageclasses"
        resource={labelsStorageClass}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsStorageClass)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsStorageClass(null)
          }
        }}
        resourceType="storageclasses"
        resource={annotationsStorageClass}
        type="annotations"
      />
    </>
  )
}
