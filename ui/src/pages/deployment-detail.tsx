import { useCallback, useEffect, useState } from 'react'
import {
  IconLoader,
  IconRefresh,
  IconReload,
  IconScale,
  IconTrash,
} from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import { Deployment } from 'kubernetes-types/apps/v1'
import { Container } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  patchResource,
  updateResource,
  useResource,
  useResourcesWatch,
} from '@/lib/api'
import {
  buildDeploymentOverviewViewModel,
  getDeploymentStatus,
  toSimpleContainer,
} from '@/lib/k8s'
import { formatDate, translateError } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { ContainerEditDialog } from '@/components/container-edit-dialog'
import { ContainerTable } from '@/components/container-table'
import { DeploymentOverviewInfoCard } from '@/components/deployment-overview-info-card'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LogViewer } from '@/components/log-viewer'
import { PodMonitoring } from '@/components/pod-monitoring'
import { PodTable } from '@/components/pod-table'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { Terminal } from '@/components/terminal'
import { VolumeTable } from '@/components/volume-table'
import { YamlEditor } from '@/components/yaml-editor'

export function DeploymentDetail(props: { namespace: string; name: string }) {
  const { namespace, name } = props
  const [scaleReplicas, setScaleReplicas] = useState<number>(1)
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [isScalePopoverOpen, setIsScalePopoverOpen] = useState(false)
  const [isRestartPopoverOpen, setIsRestartPopoverOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState<number>(0)
  const [isContainerEditorOpen, setIsContainerEditorOpen] = useState(false)
  const [selectedContainerName, setSelectedContainerName] = useState<string>()
  const { t } = useTranslation()

  // Fetch deployment data
  const {
    data: deployment,
    isLoading: isLoadingDeployment,
    isError: isDeploymentError,
    error: deploymentError,
    refetch: refetchDeployment,
  } = useResource('deployments', name, namespace, {
    refreshInterval,
  })

  const labelSelector = deployment?.spec?.selector.matchLabels
    ? Object.entries(deployment.spec.selector.matchLabels)
        .map(([key, value]) => `${key}=${value}`)
        .join(',')
    : undefined
  const { data: relatedPods, isLoading: isLoadingPods } = useResourcesWatch(
    'pods',
    namespace,
    {
      labelSelector,
      enabled: !!deployment?.spec?.selector.matchLabels,
    }
  )

  useEffect(() => {
    if (deployment) {
      setYamlContent(yaml.dump(deployment, { indent: 2 }))
      setScaleReplicas(deployment.spec?.replicas || 1)
    }
  }, [deployment])

  // Auto-reset refresh interval when deployment reaches stable state
  useEffect(() => {
    if (deployment) {
      const status = getDeploymentStatus(deployment)
      const isStable =
        status === 'Available' ||
        status === 'Scaled Down' ||
        status === 'Paused'

      if (isStable) {
        const timer = setTimeout(() => {
          setRefreshInterval(0)
        }, 2000)
        return () => clearTimeout(timer)
      } else {
        setRefreshInterval(1000)
      }
    }
  }, [deployment, refreshInterval])

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1)
    refetchDeployment()
  }

  const handleRestart = useCallback(async () => {
    if (!deployment) return

    try {
      const updatedDeployment = { ...deployment } as Deployment

      if (!updatedDeployment.spec!.template?.metadata?.annotations) {
        updatedDeployment!.spec!.template!.metadata!.annotations = {}
      }
      updatedDeployment.spec!.template!.metadata!.annotations![
        'kite.kubernetes.io/restartedAt'
      ] = new Date().toISOString()
      await updateResource('deployments', name, namespace, updatedDeployment)
      toast.success('Deployment restart initiated')
      setIsRestartPopoverOpen(false)
      setRefreshInterval(1000)
    } catch (error) {
      console.error('Failed to restart deployment:', error)
      toast.error(translateError(error, t))
    }
  }, [t, deployment, name, namespace])

  const handleScale = useCallback(async () => {
    if (!deployment) return

    try {
      const updatedDeployment = {
        spec: {
          replicas: scaleReplicas,
        },
      }
      await patchResource('deployments', name, namespace, updatedDeployment)
      toast.success(`Deployment scaled to ${scaleReplicas} replicas`)
      setIsScalePopoverOpen(false)
      setRefreshInterval(1000)
    } catch (error) {
      console.error('Failed to restart deployment:', error)
      toast.error(translateError(error, t))
    }
  }, [t, deployment, name, namespace, scaleReplicas])

  const handleSaveYaml = async (content: Deployment) => {
    setIsSavingYaml(true)
    try {
      await updateResource('deployments', name, namespace, content)
      toast.success('YAML saved successfully')
      setRefreshInterval(1000)
    } catch (error) {
      console.error('Failed to save YAML:', error)
      toast.error(translateError(error, t))
    } finally {
      setIsSavingYaml(false)
    }
  }

  const handleYamlChange = (content: string) => {
    setYamlContent(content)
  }

  const openContainerEditor = useCallback(
    (containerName?: string) => {
      const nextContainerName =
        containerName ||
        deployment?.spec?.template?.spec?.containers?.[0]?.name ||
        undefined

      setSelectedContainerName(nextContainerName)
      setIsContainerEditorOpen(true)
    },
    [deployment]
  )

  const handleContainerUpdate = async (
    updatedContainer: Container,
    init = false
  ) => {
    if (!deployment) return

    try {
      // Create a deep copy of the deployment
      const updatedDeployment = { ...deployment }

      if (init) {
        // Update the specific container in the deployment spec
        if (updatedDeployment.spec?.template?.spec?.initContainers) {
          const containerIndex =
            updatedDeployment.spec.template.spec.initContainers.findIndex(
              (c) => c.name === updatedContainer.name
            )

          if (containerIndex >= 0) {
            updatedDeployment.spec.template.spec.initContainers[
              containerIndex
            ] = updatedContainer
          }
        }
      } else {
        // Update the specific container in the deployment spec
        if (updatedDeployment.spec?.template?.spec?.containers) {
          const containerIndex =
            updatedDeployment.spec.template.spec.containers.findIndex(
              (c) => c.name === updatedContainer.name
            )

          if (containerIndex >= 0) {
            updatedDeployment.spec.template.spec.containers[containerIndex] =
              updatedContainer
          }
        }
      }

      // Call the update API
      await updateResource('deployments', name, namespace, updatedDeployment)
      toast.success(`Container ${updatedContainer.name} updated successfully`)
      setRefreshInterval(1000)
    } catch (error) {
      console.error('Failed to update container:', error)
      toast.error(translateError(error, t))
    }
  }

  const handleDeploymentSave = useCallback(
    async (updatedDeployment: Deployment) => {
      try {
        await updateResource('deployments', name, namespace, updatedDeployment)
        toast.success(t('containerEditor.saveSuccess'))
        setRefreshInterval(1000)
      } catch (error) {
        console.error('Failed to update deployment:', error)
        toast.error(translateError(error, t))
        throw error
      }
    },
    [name, namespace, t]
  )

  if (isLoadingDeployment) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <IconLoader className="animate-spin" />
              <span>
                {t('detail.status.loading', {
                  resource: t('resourceKind.deployment'),
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isDeploymentError || !deployment) {
    return (
      <ErrorMessage
        resourceName={'Deployment'}
        error={deploymentError}
        refetch={handleRefresh}
      />
    )
  }

  const { status } = deployment
  const overview = buildDeploymentOverviewViewModel(deployment)
  const containerCount =
    deployment.spec?.template?.spec?.containers?.length || 0

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{name}</h1>
          <p className="text-muted-foreground">
            {t('detail.fields.namespace')}:{' '}
            <span className="font-medium">{namespace}</span>
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <IconRefresh className="w-4 h-4" />
            {t('detail.buttons.refresh')}
          </Button>
          <DescribeDialog
            resourceType="deployments"
            namespace={namespace}
            name={name}
          />
          <Popover
            open={isScalePopoverOpen}
            onOpenChange={setIsScalePopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <IconScale className="w-4 h-4" />
                {t('detail.buttons.scale')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">
                    {t('detail.dialogs.scaleDeployment.title')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('detail.dialogs.scaleDeployment.description')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="replicas">
                    {t('detail.dialogs.scaleDeployment.replicas')}
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() =>
                        setScaleReplicas(Math.max(0, scaleReplicas - 1))
                      }
                      disabled={scaleReplicas <= 0}
                    >
                      -
                    </Button>
                    <Input
                      id="replicas"
                      type="number"
                      min="0"
                      value={scaleReplicas}
                      onChange={(e) =>
                        setScaleReplicas(parseInt(e.target.value) || 0)
                      }
                      className="text-center"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setScaleReplicas(scaleReplicas + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <Button onClick={handleScale} className="w-full">
                  <IconScale className="w-4 h-4 mr-2" />
                  {t('detail.dialogs.scaleDeployment.scaleButton')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Popover
            open={isRestartPopoverOpen}
            onOpenChange={setIsRestartPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <IconReload className="w-4 h-4" />
                {t('detail.buttons.restart')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">
                    {t('detail.dialogs.restartDeployment.title')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('detail.dialogs.restartDeployment.description')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsRestartPopoverOpen(false)}
                    className="flex-1"
                  >
                    {t('detail.buttons.cancel')}
                  </Button>
                  <Button
                    onClick={() => {
                      handleRestart()
                      setIsRestartPopoverOpen(false)
                    }}
                    className="flex-1"
                  >
                    <IconReload className="w-4 h-4 mr-2" />
                    {t('detail.dialogs.restartDeployment.restartButton')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <IconTrash className="w-4 h-4" />
            {t('detail.buttons.delete')}
          </Button>
        </div>
      </div>
      {/* Tabs */}
      <ResponsiveTabs
        tabs={[
          {
            value: 'overview',
            label: t('detail.tabs.overview'),
            content: (
              <div className="space-y-4">
                <DeploymentOverviewInfoCard
                  overview={overview}
                  containerCount={containerCount}
                  onEdit={() => openContainerEditor()}
                />

                {deployment.spec?.template.spec?.initContainers?.length &&
                  deployment.spec?.template.spec?.initContainers?.length >
                    0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {t('detail.sections.initContainers')} (
                          {
                            deployment.spec?.template?.spec?.initContainers
                              ?.length
                          }
                          )
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          <div className="space-y-4">
                            {deployment.spec?.template?.spec?.initContainers?.map(
                              (container) => (
                                <ContainerTable
                                  key={container.name}
                                  container={container}
                                  onContainerUpdate={(updatedContainer) =>
                                    handleContainerUpdate(
                                      updatedContainer,
                                      true
                                    )
                                  }
                                />
                              )
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Containers (
                      {deployment.spec?.template?.spec?.containers?.length || 0}
                      )
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="space-y-4">
                        {deployment.spec?.template?.spec?.containers?.map(
                          (container) => (
                            <ContainerTable
                              key={container.name}
                              container={container}
                              onEditRequest={(selectedContainer) =>
                                openContainerEditor(selectedContainer.name)
                              }
                            />
                          )
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Conditions */}
                {status?.conditions && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('detail.sections.conditions')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {status.conditions.map((condition, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-2 border rounded"
                          >
                            <Badge
                              variant={
                                condition.status === 'True'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {condition.type}
                            </Badge>
                            <span className="text-sm">{condition.message}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDate(
                                condition.lastTransitionTime ||
                                  condition.lastUpdateTime ||
                                  ''
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ),
          },
          {
            value: 'yaml',
            label: t('detail.tabs.yaml'),
            content: (
              <YamlEditor<'deployments'>
                key={refreshKey}
                value={yamlContent}
                title={t('yamlEditor.title')}
                onSave={handleSaveYaml}
                onChange={handleYamlChange}
                isSaving={isSavingYaml}
              />
            ),
          },
          ...(relatedPods
            ? [
                {
                  value: 'pods',
                  label: (
                    <>
                      Pods{' '}
                      {relatedPods && (
                        <Badge variant="secondary">{relatedPods.length}</Badge>
                      )}
                    </>
                  ),
                  content: (
                    <PodTable
                      pods={relatedPods}
                      isLoading={isLoadingPods}
                      labelSelector={labelSelector}
                    />
                  ),
                },
                {
                  value: 'logs',
                  label: t('detail.tabs.logs'),
                  content: (
                    <div className="space-y-6">
                      <LogViewer
                        namespace={namespace}
                        pods={relatedPods}
                        containers={deployment.spec?.template.spec?.containers}
                        initContainers={
                          deployment.spec?.template.spec?.initContainers
                        }
                        labelSelector={labelSelector}
                      />
                    </div>
                  ),
                },
                {
                  value: 'terminal',
                  label: t('detail.tabs.terminal'),
                  content: (
                    <div className="space-y-6">
                      {relatedPods && relatedPods.length > 0 && (
                        <Terminal
                          namespace={namespace}
                          pods={relatedPods}
                          containers={
                            deployment.spec?.template.spec?.containers
                          }
                          initContainers={
                            deployment.spec?.template.spec?.initContainers
                          }
                        />
                      )}
                    </div>
                  ),
                },
              ]
            : []),
          {
            value: 'Related',
            label: t('detail.tabs.related'),
            content: (
              <RelatedResourcesTable
                resource={'deployments'}
                name={name}
                namespace={namespace}
              />
            ),
          },
          {
            value: 'history',
            label: 'History',
            content: (
              <ResourceHistoryTable
                resourceType="deployments"
                name={name}
                namespace={namespace}
                currentResource={deployment}
              />
            ),
          },
          ...(deployment.spec?.template?.spec?.volumes
            ? [
                {
                  value: 'volumes',
                  label: (
                    <>
                      Volumes{' '}
                      <Badge variant="secondary">
                        {deployment.spec.template.spec.volumes.length}
                      </Badge>
                    </>
                  ),
                  content: (
                    <VolumeTable
                      namespace={namespace}
                      volumes={deployment.spec?.template?.spec?.volumes}
                      containers={toSimpleContainer(
                        deployment.spec?.template?.spec?.initContainers,
                        deployment.spec?.template?.spec?.containers
                      )}
                      isLoading={isLoadingDeployment}
                    />
                  ),
                },
              ]
            : []),
          {
            value: 'events',
            label: t('detail.tabs.events'),
            content: (
              <EventTable
                resource="deployments"
                name={name}
                namespace={namespace}
              />
            ),
          },
          {
            value: 'monitor',
            label: t('detail.tabs.monitor'),
            content: (
              <PodMonitoring
                namespace={namespace}
                pods={relatedPods}
                containers={deployment.spec?.template.spec?.containers}
                initContainers={deployment.spec?.template.spec?.initContainers}
                labelSelector={labelSelector}
              />
            ),
          },
        ]}
      />

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={name}
        resourceType="deployments"
        namespace={namespace}
      />
      {isContainerEditorOpen ? (
        <ContainerEditDialog
          mode="deployment"
          open={isContainerEditorOpen}
          onOpenChange={setIsContainerEditorOpen}
          deployment={deployment}
          namespace={namespace}
          initialContainerName={selectedContainerName}
          onSaveDeployment={handleDeploymentSave}
        />
      ) : null}
    </div>
  )
}
