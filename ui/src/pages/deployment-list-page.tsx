import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Deployment } from 'kubernetes-types/apps/v1'
import type { Container } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, RefreshCcw, Scaling, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  aggregateContainerResources,
  getDeploymentStatus,
} from '@/lib/k8s'
import { patchResource } from '@/lib/api'
import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate, formatRelativeTimeStrict, translateError } from '@/lib/utils'
import { ContainerImagesSummary } from '@/components/container-images-summary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeploymentStatusIcon } from '@/components/deployment-status-icon'
import { DeploymentCreateDialog } from '@/components/editors/deployment-create-dialog'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function ResourceLimitsSummary(props: { containers?: Container[] }) {
  const { containers } = props
  const limits = aggregateContainerResources(containers).limits

  if (!limits.cpu && !limits.memory) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  return (
    <div className="flex max-w-[240px] flex-wrap gap-1.5">
      {limits.cpu ? (
        <Badge
          variant="secondary"
          className="h-6 rounded-full px-2.5 font-mono tabular-nums"
        >
          <span className="text-muted-foreground">CPU:</span>
          <span className="sr-only"> </span>
          <span className="text-foreground">{limits.cpu}</span>
        </Badge>
      ) : null}
      {limits.memory ? (
        <Badge
          variant="secondary"
          className="h-6 rounded-full px-2.5 font-mono tabular-nums"
        >
          <span className="text-muted-foreground">Memory:</span>
          <span className="sr-only"> </span>
          <span className="text-foreground">{limits.memory}</span>
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
  const [scaleDeploymentTarget, setScaleDeploymentTarget] =
    useState<Deployment | null>(null)
  const [restartDeploymentTarget, setRestartDeploymentTarget] =
    useState<Deployment | null>(null)
  const [scaleReplicas, setScaleReplicas] = useState<number>(0)
  const [isScaling, setIsScaling] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)

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

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const refreshDeploymentList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['deployments'] })
  }, [queryClient])

  const openScaleDialog = useCallback((deployment: Deployment) => {
    setScaleDeploymentTarget(deployment)
    setScaleReplicas(deployment.spec?.replicas || 0)
  }, [])

  const handleScale = useCallback(async () => {
    if (
      !scaleDeploymentTarget?.metadata?.name ||
      !scaleDeploymentTarget.metadata?.namespace
    ) {
      return
    }

    setIsScaling(true)
    try {
      await patchResource(
        'deployments',
        scaleDeploymentTarget.metadata.name,
        scaleDeploymentTarget.metadata.namespace,
        {
          spec: {
            replicas: scaleReplicas,
          },
        }
      )
      toast.success(`Deployment scaled to ${scaleReplicas} replicas`)
      setScaleDeploymentTarget(null)
      await refreshDeploymentList()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsScaling(false)
    }
  }, [refreshDeploymentList, scaleDeploymentTarget, scaleReplicas, t])

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

  const getRowContextMenuItems = useCallback(
    (deployment: Deployment): RowContextMenuItem<Deployment>[] => {
      const detailPath = getDeploymentDetailPath(deployment)

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${detailPath}?tab=yaml`),
        },
        { type: 'separator', key: 'primary-actions-separator' },
        {
          key: 'copy-name',
          label: t('common.copyName', 'Copy name'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(deployment.metadata?.name || ''),
        },
        {
          key: 'copy-namespace',
          label: t('common.copyNamespace', 'Copy namespace'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(deployment.metadata?.namespace || ''),
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
        { type: 'separator', key: 'deployment-operations-separator' },
        {
          key: 'scale-deployment',
          label: t('detail.buttons.scale'),
          icon: <Scaling className="h-4 w-4" />,
          onSelect: () => openScaleDialog(deployment),
        },
        {
          key: 'restart-deployment',
          label: t('detail.buttons.restart'),
          icon: <RefreshCcw className="h-4 w-4" />,
          onSelect: () => setRestartDeploymentTarget(deployment),
        },
      ]
    },
    [getDeploymentDetailPath, handleCopy, navigate, openScaleDialog, t]
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
        open={Boolean(scaleDeploymentTarget)}
        onOpenChange={(open) => {
          if (!open && !isScaling) {
            setScaleDeploymentTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('detail.dialogs.scaleDeployment.title')}</DialogTitle>
            <DialogDescription>
              {t('detail.dialogs.scaleDeployment.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deployment-scale-replicas">
              {t('detail.dialogs.scaleDeployment.replicas')}
            </Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => setScaleReplicas(Math.max(0, scaleReplicas - 1))}
                disabled={scaleReplicas <= 0 || isScaling}
              >
                -
              </Button>
              <Input
                id="deployment-scale-replicas"
                type="number"
                min="0"
                value={scaleReplicas}
                onChange={(event) =>
                  setScaleReplicas(parseInt(event.target.value) || 0)
                }
                className="text-center"
                disabled={isScaling}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => setScaleReplicas(scaleReplicas + 1)}
                disabled={isScaling}
              >
                +
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScaleDeploymentTarget(null)}
              disabled={isScaling}
            >
              {t('detail.buttons.cancel')}
            </Button>
            <Button onClick={handleScale} disabled={isScaling}>
              {t('detail.dialogs.scaleDeployment.scaleButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
