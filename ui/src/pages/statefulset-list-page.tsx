import { useCallback, useMemo, useState } from 'react'
import { IconCircleCheckFilled, IconLoader } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { StatefulSet } from 'kubernetes-types/apps/v1'
import {
  FileCode2,
  FileText,
  History,
  Image,
  RefreshCcw,
  Tags,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { patchResource } from '@/lib/api'
import {
  formatDate,
  formatRelativeTimeStrict,
  translateError,
} from '@/lib/utils'
import { WorkloadWithPodTemplate } from '@/hooks/use-deployment-container-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ContainerEditDialog } from '@/components/container-edit-dialog'
import { ContainerImagesSummary } from '@/components/container-images-summary'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceLimitsSummary } from '@/components/resource-limits-summary'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

export function StatefulSetListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [labelsStatefulSet, setLabelsStatefulSet] =
    useState<StatefulSet | null>(null)
  const [annotationsStatefulSet, setAnnotationsStatefulSet] =
    useState<StatefulSet | null>(null)
  const [restartStatefulSetTarget, setRestartStatefulSetTarget] =
    useState<StatefulSet | null>(null)
  const [imageStatefulSetTarget, setImageStatefulSetTarget] =
    useState<StatefulSet | null>(null)
  const [deleteStatefulSetTarget, setDeleteStatefulSetTarget] =
    useState<StatefulSet | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const columnHelper = useMemo(() => createColumnHelper<StatefulSet>(), [])

  // Define columns for the statefulset table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/statefulsets/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.status?.readyReplicas ?? 0, {
        id: 'ready',
        header: t('deployments.ready'),
        cell: ({ row }) => {
          const status = row.original.status
          const ready = status?.readyReplicas || 0
          const desired = status?.replicas || 0
          return (
            <div>
              {ready} / {desired}
            </div>
          )
        },
      }),
      columnHelper.accessor('status.conditions', {
        header: t('common.status'),
        cell: ({ row }) => {
          const readyReplicas = row.original.status?.readyReplicas || 0
          const replicas = row.original.status?.replicas || 0
          const isAvailable = readyReplicas === replicas
          const status = isAvailable
            ? t('deployments.available')
            : t('common.loading')
          if (replicas === 0) {
            return (
              <Badge
                variant="secondary"
                className="text-muted-foreground px-1.5"
              >
                -
              </Badge>
            )
          }

          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              {isAvailable ? (
                <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
              ) : (
                <IconLoader className="animate-spin" />
              )}
              {status}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('spec.serviceName', {
        header: t('detail.fields.serviceName'),
        cell: ({ getValue }) => getValue() || '-',
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
            onClick={() => setLabelsStatefulSet(row.original)}
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
            onClick={() => setAnnotationsStatefulSet(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'containers-and-images',
        header: t('deploymentOverview.containersAndImages'),
        cell: ({ row }) => (
          <ContainerImagesSummary
            containers={row.original.spec?.template?.spec?.containers}
          />
        ),
      }),
      columnHelper.display({
        id: 'resource-limits',
        header: t('deploymentOverview.resourceLimits'),
        cell: ({ row }) => (
          <ResourceLimitsSummary
            containers={row.original.spec?.template?.spec?.containers}
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

  // Custom filter for statefulset search
  const statefulSetSearchFilter = useCallback(
    (statefulSet: StatefulSet, query: string) => {
      return (
        statefulSet.metadata!.name!.toLowerCase().includes(query) ||
        (statefulSet.metadata!.namespace?.toLowerCase() || '').includes(
          query
        ) ||
        (statefulSet.spec!.serviceName?.toLowerCase() || '').includes(query) ||
        Object.entries(statefulSet.metadata?.labels || {}).some(
          ([key, value]) =>
            key.toLowerCase().includes(query) ||
            value.toLowerCase().includes(query)
        ) ||
        Object.entries(statefulSet.metadata?.annotations || {}).some(
          ([key, value]) =>
            key.toLowerCase().includes(query) ||
            value.toLowerCase().includes(query)
        ) ||
        (statefulSet.spec?.template?.spec?.containers || []).some(
          (container) =>
            container.name.toLowerCase().includes(query) ||
            (container.image || '').toLowerCase().includes(query)
        )
      )
    },
    []
  )

  const getStatefulSetDetailPath = useCallback((statefulSet: StatefulSet) => {
    return `/statefulsets/${statefulSet.metadata!.namespace}/${statefulSet.metadata!.name}`
  }, [])

  const refreshStatefulSetList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
  }, [queryClient])

  const handleRestart = useCallback(async () => {
    if (
      !restartStatefulSetTarget?.metadata?.name ||
      !restartStatefulSetTarget.metadata?.namespace
    ) {
      return
    }

    setIsRestarting(true)
    try {
      await patchResource(
        'statefulsets',
        restartStatefulSetTarget.metadata.name,
        restartStatefulSetTarget.metadata.namespace,
        {
          spec: {
            template: {
              metadata: {
                annotations: {
                  'kite.kubernetes.io/restartedAt': new Date().toISOString(),
                },
              },
            },
          },
        }
      )
      toast.success('StatefulSet restart initiated')
      setRestartStatefulSetTarget(null)
      await refreshStatefulSetList()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsRestarting(false)
    }
  }, [refreshStatefulSetList, restartStatefulSetTarget, t])

  const handleContainerEditorSave = useCallback(
    async (updatedWorkload: WorkloadWithPodTemplate) => {
      if (
        !imageStatefulSetTarget?.metadata?.name ||
        !imageStatefulSetTarget.metadata?.namespace
      ) {
        return
      }

      await patchResource(
        'statefulsets',
        imageStatefulSetTarget.metadata.name,
        imageStatefulSetTarget.metadata.namespace,
        {
          spec: {
            template: updatedWorkload.spec?.template,
          },
        }
      )
      toast.success(t('deploymentList.imageUpdateInitiated'))
      await refreshStatefulSetList()
    },
    [imageStatefulSetTarget, refreshStatefulSetList, t]
  )

  const getRowContextMenuItems = useCallback(
    (statefulSet: StatefulSet): RowContextMenuItem<StatefulSet>[] => {
      const detailPath = getStatefulSetDetailPath(statefulSet)

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=yaml`),
        },
        {
          key: 'edit-image',
          label: t('deploymentList.editImage'),
          icon: <Image className="h-4 w-4" />,
          onSelect: () => setImageStatefulSetTarget(statefulSet),
        },
        {
          key: 'rollout-restart',
          label: t('deploymentList.rolloutRestart'),
          icon: <RefreshCcw className="h-4 w-4" />,
          onSelect: () => setRestartStatefulSetTarget(statefulSet),
        },
        {
          key: 'rollback',
          label: t('deploymentList.rollback'),
          icon: <History className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=history`),
        },
        { type: 'separator', key: 'metadata-actions-separator' },
        {
          key: 'manage-labels',
          label: t('common.manageLabels', 'Manage labels'),
          icon: <Tags className="h-4 w-4" />,
          onSelect: () => setLabelsStatefulSet(statefulSet),
        },
        {
          key: 'manage-annotations',
          label: t('common.manageAnnotations', 'Manage annotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsStatefulSet(statefulSet),
        },
        {
          key: 'delete-statefulset',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteStatefulSetTarget(statefulSet),
        },
      ]
    },
    [getStatefulSetDetailPath, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName={'StatefulSets'}
        resourceType="statefulsets"
        columns={columns}
        searchQueryFilter={statefulSetSearchFilter}
        getRowContextMenuItems={getRowContextMenuItems}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
      />

      <Dialog
        open={Boolean(restartStatefulSetTarget)}
        onOpenChange={(open) => {
          if (!open && !isRestarting) {
            setRestartStatefulSetTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('aiChat.action.restart', {
                target:
                  restartStatefulSetTarget?.metadata?.name || 'StatefulSet',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('detail.dialogs.restartDeployment.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestartStatefulSetTarget(null)}
              disabled={isRestarting}
            >
              {t('detail.buttons.cancel')}
            </Button>
            <Button onClick={handleRestart} disabled={isRestarting}>
              {t('detail.dialogs.restartDeployment.restartButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResourceMetadataDialog
        open={Boolean(labelsStatefulSet)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsStatefulSet(null)
          }
        }}
        resourceType="statefulsets"
        resource={labelsStatefulSet}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsStatefulSet)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsStatefulSet(null)
          }
        }}
        resourceType="statefulsets"
        resource={annotationsStatefulSet}
        type="annotations"
      />

      {imageStatefulSetTarget ? (
        <ContainerEditDialog
          open={Boolean(imageStatefulSetTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setImageStatefulSetTarget(null)
            }
          }}
          mode="deployment"
          workload={imageStatefulSetTarget}
          namespace={imageStatefulSetTarget.metadata?.namespace || ''}
          onSaveWorkload={handleContainerEditorSave}
        />
      ) : null}

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteStatefulSetTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStatefulSetTarget(null)
          }
        }}
        resourceName={deleteStatefulSetTarget?.metadata?.name || ''}
        resourceType="statefulsets"
        namespace={deleteStatefulSetTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
