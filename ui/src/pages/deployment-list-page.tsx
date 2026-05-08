import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Deployment } from 'kubernetes-types/apps/v1'
import type { Container } from 'kubernetes-types/core/v1'
import {
  FileCode2,
  FileText,
  History,
  Image,
  Pause,
  Play,
  RefreshCcw,
  Tags,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { patchResource } from '@/lib/api'
import { aggregateContainerResources, getDeploymentStatus } from '@/lib/k8s'
import {
  formatDate,
  formatRelativeTimeStrict,
  translateError,
} from '@/lib/utils'
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
import { DeploymentStatusIcon } from '@/components/deployment-status-icon'
import { DeploymentCreateDialog } from '@/components/editors/deployment-create-dialog'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

const cpuUnits: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
}

const binaryMemoryUnits: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
}

const decimalMemoryUnits: Record<string, number> = {
  '': 1,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
}

function trimTrailingZeros(value: number, fractionDigits: number) {
  return value.toFixed(fractionDigits).replace(/\.?0+$/, '')
}

function formatCpuAsCores(value?: string, coreUnitLabel = '核') {
  if (!value) {
    return undefined
  }

  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)(n|u|m|k|M|G|T|P|E)?$/)
  if (!match) {
    return value
  }

  const amount = Number(match[1])
  const suffix = match[2] ?? ''
  const multiplier = cpuUnits[suffix]
  if (Number.isNaN(amount) || multiplier === undefined) {
    return value
  }

  const cores = amount * multiplier
  return `${trimTrailingZeros(cores, 1)} ${coreUnitLabel}`
}

function formatMemoryAsGi(value?: string) {
  if (!value) {
    return undefined
  }

  const match = value
    .trim()
    .match(/^([+-]?\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/)
  if (!match) {
    return value
  }

  const amount = Number(match[1])
  const suffix = match[2] ?? ''
  if (Number.isNaN(amount)) {
    return value
  }

  const bytes =
    suffix in binaryMemoryUnits
      ? amount * binaryMemoryUnits[suffix]
      : amount * (decimalMemoryUnits[suffix] ?? 1)

  const gibibytes = bytes / binaryMemoryUnits.Gi
  return `${trimTrailingZeros(gibibytes, 1)}Gi`
}

function ResourceLimitsSummary(props: { containers?: Container[] }) {
  const { t } = useTranslation()
  const { containers } = props
  const limits = aggregateContainerResources(containers).limits
  const formattedCpu = formatCpuAsCores(
    limits.cpu,
    t('namespaceEditDialog.unitCpuCore', '核')
  )
  const formattedMemory = formatMemoryAsGi(limits.memory)

  if (!formattedCpu && !formattedMemory) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
      {formattedCpu ? (
        <Badge
          variant="secondary"
          className="h-6 shrink-0 rounded-full px-2.5 font-mono tabular-nums whitespace-nowrap"
        >
          <span className="text-muted-foreground">CPU:</span>
          <span className="sr-only"> </span>
          <span className="text-foreground">{formattedCpu}</span>
        </Badge>
      ) : null}
      {formattedMemory ? (
        <Badge
          variant="secondary"
          className="h-6 shrink-0 rounded-full px-2.5 font-mono tabular-nums whitespace-nowrap"
        >
          <span className="text-muted-foreground">Memory:</span>
          <span className="sr-only"> </span>
          <span className="text-foreground">{formattedMemory}</span>
        </Badge>
      ) : null}
    </div>
  )
}

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

export function DeploymentListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [labelsDeployment, setLabelsDeployment] = useState<Deployment | null>(
    null
  )
  const [annotationsDeployment, setAnnotationsDeployment] =
    useState<Deployment | null>(null)
  const [restartDeploymentTarget, setRestartDeploymentTarget] =
    useState<Deployment | null>(null)
  const [imageDeploymentTarget, setImageDeploymentTarget] =
    useState<Deployment | null>(null)
  const [deleteDeploymentTarget, setDeleteDeploymentTarget] =
    useState<Deployment | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const [isPauseToggling, setIsPauseToggling] = useState(false)

  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Deployment>()

  // Define columns for the deployment table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/deployments/${row.original.metadata!.namespace}/${
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
          const status = getDeploymentStatus(row.original)
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <DeploymentStatusIcon status={status} />
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
            ariaLabel={t('deploymentList.manageLabels')}
            count={Object.keys(row.original.metadata?.labels || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.labels
            )}
            onClick={() => setLabelsDeployment(row.original)}
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
            ariaLabel={t('deploymentList.manageAnnotations')}
            count={Object.keys(row.original.metadata?.annotations || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.annotations
            )}
            onClick={() => setAnnotationsDeployment(row.original)}
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
        cell: ({ getValue }) => formatTimestampWithRelative(getValue()),
      }),
    ],
    [columnHelper, t]
  )

  // Custom filter for deployment search
  const deploymentSearchFilter = useCallback(
    (deployment: Deployment, query: string) => {
      return (
        deployment.metadata!.name!.toLowerCase().includes(query) ||
        (deployment.metadata!.namespace?.toLowerCase() || '').includes(query)
      )
    },
    []
  )

  const handleCreateClick = () => {
    setIsCreateDialogOpen(true)
  }

  const handleCreateSuccess = (deployment: Deployment, namespace: string) => {
    // Navigate to the newly created deployment's detail page
    navigate(`/deployments/${namespace}/${deployment.metadata?.name}`)
  }

  const getDeploymentDetailPath = useCallback((deployment: Deployment) => {
    return `/deployments/${deployment.metadata!.namespace}/${deployment.metadata!.name}`
  }, [])

  const refreshDeploymentList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['deployments'] })
  }, [queryClient])

  const handleRestart = useCallback(async () => {
    if (
      !restartDeploymentTarget?.metadata?.name ||
      !restartDeploymentTarget.metadata?.namespace
    ) {
      return
    }

    setIsRestarting(true)
    try {
      await patchResource(
        'deployments',
        restartDeploymentTarget.metadata.name,
        restartDeploymentTarget.metadata.namespace,
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
      toast.success('Deployment restart initiated')
      setRestartDeploymentTarget(null)
      await refreshDeploymentList()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsRestarting(false)
    }
  }, [refreshDeploymentList, restartDeploymentTarget, t])

  const handlePauseToggle = useCallback(
    async (deployment: Deployment) => {
      if (!deployment.metadata?.name || !deployment.metadata?.namespace) {
        return
      }

      const nextPaused = deployment.spec?.paused !== true

      setIsPauseToggling(true)
      try {
        await patchResource(
          'deployments',
          deployment.metadata.name,
          deployment.metadata.namespace,
          {
            spec: {
              paused: nextPaused,
            },
          }
        )
        toast.success(
          nextPaused
            ? t('deploymentList.pauseInitiated')
            : t('deploymentList.resumeInitiated')
        )
        await refreshDeploymentList()
      } catch (error) {
        toast.error(translateError(error, t))
      } finally {
        setIsPauseToggling(false)
      }
    },
    [refreshDeploymentList, t]
  )

  const handleContainerEditorSave = useCallback(
    async (updatedDeployment: Deployment) => {
      if (
        !imageDeploymentTarget?.metadata?.name ||
        !imageDeploymentTarget.metadata?.namespace
      ) {
        return
      }

      await patchResource(
        'deployments',
        imageDeploymentTarget.metadata.name,
        imageDeploymentTarget.metadata.namespace,
        {
          spec: {
            template: updatedDeployment.spec?.template,
          },
        }
      )
      toast.success(t('deploymentList.imageUpdateInitiated'))
      await refreshDeploymentList()
    },
    [imageDeploymentTarget, refreshDeploymentList, t]
  )

  const getRowContextMenuItems = useCallback(
    (deployment: Deployment): RowContextMenuItem<Deployment>[] => {
      const detailPath = getDeploymentDetailPath(deployment)
      const isPaused = deployment.spec?.paused === true

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
          onSelect: () => setImageDeploymentTarget(deployment),
        },
        {
          key: isPaused ? 'resume-orchestration' : 'pause-orchestration',
          label: isPaused
            ? t('deploymentList.resumeOrchestration')
            : t('deploymentList.pauseOrchestration'),
          icon: isPaused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          ),
          disabled: isPauseToggling,
          onSelect: () => handlePauseToggle(deployment),
        },
        {
          key: 'rollout-restart',
          label: t('deploymentList.rolloutRestart'),
          icon: <RefreshCcw className="h-4 w-4" />,
          onSelect: () => setRestartDeploymentTarget(deployment),
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
          label: t('deploymentList.manageLabels'),
          icon: <Tags className="h-4 w-4" />,
          onSelect: () => setLabelsDeployment(deployment),
        },
        {
          key: 'manage-annotations',
          label: t('deploymentList.manageAnnotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsDeployment(deployment),
        },
        {
          key: 'delete-deployment',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteDeploymentTarget(deployment),
        },
      ]
    },
    [getDeploymentDetailPath, handlePauseToggle, isPauseToggling, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName="Deployments"
        columns={columns}
        searchQueryFilter={deploymentSearchFilter}
        showCreateButton={true}
        onCreateClick={handleCreateClick}
        getRowContextMenuItems={getRowContextMenuItems}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
      />

      <DeploymentCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <Dialog
        open={Boolean(restartDeploymentTarget)}
        onOpenChange={(open) => {
          if (!open && !isRestarting) {
            setRestartDeploymentTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('detail.dialogs.restartDeployment.title')}
            </DialogTitle>
            <DialogDescription>
              {t('detail.dialogs.restartDeployment.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestartDeploymentTarget(null)}
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
        open={Boolean(labelsDeployment)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsDeployment(null)
          }
        }}
        resourceType="deployments"
        resource={labelsDeployment}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsDeployment)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsDeployment(null)
          }
        }}
        resourceType="deployments"
        resource={annotationsDeployment}
        type="annotations"
      />

      {imageDeploymentTarget ? (
        <ContainerEditDialog
          open={Boolean(imageDeploymentTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setImageDeploymentTarget(null)
            }
          }}
          mode="deployment"
          deployment={imageDeploymentTarget}
          namespace={imageDeploymentTarget.metadata?.namespace || ''}
          onSaveDeployment={handleContainerEditorSave}
        />
      ) : null}

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteDeploymentTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDeploymentTarget(null)
          }
        }}
        resourceName={deleteDeploymentTarget?.metadata?.name || ''}
        resourceType="deployments"
        namespace={deleteDeploymentTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
