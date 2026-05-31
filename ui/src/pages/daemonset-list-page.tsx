import { useCallback, useMemo, useState } from 'react'
import { IconCircleCheckFilled, IconLoader } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { DaemonSet } from 'kubernetes-types/apps/v1'
import {
  FileCode2,
  FileText,
  History,
  Image,
  RefreshCcw,
  Tags,
  TerminalSquare,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useTerminal } from '@/contexts/terminal-context'
import { patchResource } from '@/lib/api'
import {
  formatDate,
  formatRelativeTimeStrict,
  translateError,
} from '@/lib/utils'
import { openWorkloadTerminal } from '@/lib/workload-terminal'
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

export function DaemonSetListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { openSession } = useTerminal()
  const [labelsDaemonSet, setLabelsDaemonSet] = useState<DaemonSet | null>(null)
  const [annotationsDaemonSet, setAnnotationsDaemonSet] =
    useState<DaemonSet | null>(null)
  const [restartDaemonSetTarget, setRestartDaemonSetTarget] =
    useState<DaemonSet | null>(null)
  const [imageDaemonSetTarget, setImageDaemonSetTarget] =
    useState<DaemonSet | null>(null)
  const [deleteDaemonSetTarget, setDeleteDaemonSetTarget] =
    useState<DaemonSet | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const columnHelper = useMemo(() => createColumnHelper<DaemonSet>(), [])

  // Define columns for the daemonset table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/daemonsets/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('status.desiredNumberScheduled', {
        header: t('common.desired'),
        cell: ({ getValue }) => getValue() || 0,
      }),
      columnHelper.accessor('status.currentNumberScheduled', {
        header: t('common.current'),
        cell: ({ getValue }) => getValue() || 0,
      }),
      columnHelper.accessor('status.numberReady', {
        header: t('deployments.ready'),
        cell: ({ getValue }) => getValue() || 0,
      }),
      columnHelper.accessor('status.numberAvailable', {
        header: t('deployments.available'),
        cell: ({ getValue }) => getValue() || 0,
      }),
      columnHelper.accessor('status.conditions', {
        header: t('common.status'),
        cell: ({ row }) => {
          const readyReplicas = row.original.status?.numberReady || 0
          const replicas = row.original.status?.desiredNumberScheduled || 0
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
                Pending
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
            onClick={() => setLabelsDaemonSet(row.original)}
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
            onClick={() => setAnnotationsDaemonSet(row.original)}
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

  // Custom filter for daemonset search
  const daemonSetSearchFilter = useCallback(
    (daemonSet: DaemonSet, query: string) => {
      return (
        daemonSet.metadata!.name!.toLowerCase().includes(query) ||
        (daemonSet.metadata!.namespace?.toLowerCase() || '').includes(query) ||
        Object.entries(daemonSet.metadata?.labels || {}).some(([key, value]) =>
          `${key}=${value}`.toLowerCase().includes(query)
        ) ||
        Object.entries(daemonSet.metadata?.annotations || {}).some(
          ([key, value]) => `${key}=${value}`.toLowerCase().includes(query)
        ) ||
        (daemonSet.spec?.template?.spec?.containers || []).some(
          (container) =>
            container.name.toLowerCase().includes(query) ||
            (container.image || '').toLowerCase().includes(query)
        )
      )
    },
    []
  )

  const getDaemonSetDetailPath = useCallback((daemonSet: DaemonSet) => {
    return `/daemonsets/${daemonSet.metadata!.namespace}/${daemonSet.metadata!.name}`
  }, [])

  const refreshDaemonSetList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['daemonsets'] })
  }, [queryClient])

  const handleRestart = useCallback(async () => {
    if (
      !restartDaemonSetTarget?.metadata?.name ||
      !restartDaemonSetTarget.metadata?.namespace
    ) {
      return
    }

    setIsRestarting(true)
    try {
      await patchResource(
        'daemonsets',
        restartDaemonSetTarget.metadata.name,
        restartDaemonSetTarget.metadata.namespace,
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
      toast.success('DaemonSet restart initiated')
      setRestartDaemonSetTarget(null)
      await refreshDaemonSetList()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsRestarting(false)
    }
  }, [refreshDaemonSetList, restartDaemonSetTarget, t])

  const handleContainerEditorSave = useCallback(
    async (updatedWorkload: WorkloadWithPodTemplate) => {
      if (
        !imageDaemonSetTarget?.metadata?.name ||
        !imageDaemonSetTarget.metadata?.namespace
      ) {
        return
      }

      await patchResource(
        'daemonsets',
        imageDaemonSetTarget.metadata.name,
        imageDaemonSetTarget.metadata.namespace,
        {
          spec: {
            template: updatedWorkload.spec?.template,
          },
        }
      )
      toast.success(t('deploymentList.imageUpdateInitiated'))
      await refreshDaemonSetList()
    },
    [imageDaemonSetTarget, refreshDaemonSetList, t]
  )

  const getRowContextMenuItems = useCallback(
    (daemonSet: DaemonSet): RowContextMenuItem<DaemonSet>[] => {
      const detailPath = getDaemonSetDetailPath(daemonSet)

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=yaml`),
        },
        {
          key: 'open-terminal',
          label: t('terminalLauncher.open', 'Open terminal'),
          icon: <TerminalSquare className="h-4 w-4" />,
          onSelect: () =>
            openWorkloadTerminal({
              workload: daemonSet,
              kind: 'DaemonSet',
              sourcePrefix: 'daemonset',
              openSession,
              t,
            }),
        },
        {
          key: 'edit-image',
          label: t('deploymentList.editImage'),
          icon: <Image className="h-4 w-4" />,
          onSelect: () => setImageDaemonSetTarget(daemonSet),
        },
        {
          key: 'rollout-restart',
          label: t('deploymentList.rolloutRestart'),
          icon: <RefreshCcw className="h-4 w-4" />,
          onSelect: () => setRestartDaemonSetTarget(daemonSet),
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
          onSelect: () => setLabelsDaemonSet(daemonSet),
        },
        {
          key: 'manage-annotations',
          label: t('common.manageAnnotations', 'Manage annotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsDaemonSet(daemonSet),
        },
        {
          key: 'delete-daemonset',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteDaemonSetTarget(daemonSet),
        },
      ]
    },
    [getDaemonSetDetailPath, navigate, openSession, t]
  )

  return (
    <>
      <ResourceTable
        resourceName={'DaemonSets'}
        resourceType="daemonsets"
        columns={columns}
        searchQueryFilter={daemonSetSearchFilter}
        getRowContextMenuItems={getRowContextMenuItems}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
      />

      <Dialog
        open={Boolean(restartDaemonSetTarget)}
        onOpenChange={(open) => {
          if (!open && !isRestarting) {
            setRestartDaemonSetTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('aiChat.action.restart', {
                target: restartDaemonSetTarget?.metadata?.name || 'DaemonSet',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('detail.dialogs.restartDeployment.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestartDaemonSetTarget(null)}
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
        open={Boolean(labelsDaemonSet)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsDaemonSet(null)
          }
        }}
        resourceType="daemonsets"
        resource={labelsDaemonSet}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsDaemonSet)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsDaemonSet(null)
          }
        }}
        resourceType="daemonsets"
        resource={annotationsDaemonSet}
        type="annotations"
      />

      {imageDaemonSetTarget ? (
        <ContainerEditDialog
          open={Boolean(imageDaemonSetTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setImageDaemonSetTarget(null)
            }
          }}
          mode="deployment"
          workload={imageDaemonSetTarget}
          namespace={imageDaemonSetTarget.metadata?.namespace || ''}
          onSaveWorkload={handleContainerEditorSave}
        />
      ) : null}

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteDaemonSetTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDaemonSetTarget(null)
          }
        }}
        resourceName={deleteDaemonSetTarget?.metadata?.name || ''}
        resourceType="daemonsets"
        namespace={deleteDaemonSetTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
