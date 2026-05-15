import { useEffect, useMemo, useState } from 'react'
import { IconLoader, IconTrash } from '@tabler/icons-react'
import { formatDistance } from 'date-fns'
import * as yaml from 'js-yaml'
import { Job } from 'kubernetes-types/batch/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { trackResourceAction } from '@/lib/analytics'
import { updateResource, useResource, useResources } from '@/lib/api'
import { aggregateContainerResources, getOwnerInfo } from '@/lib/k8s'
import {
  formatDate,
  formatRelativeTimeStrict,
  translateError,
} from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { ContainerImagesSummary } from '@/components/container-images-summary'
import { ContainerTable } from '@/components/container-table'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { LogViewer } from '@/components/log-viewer'
import { PodMonitoring } from '@/components/pod-monitoring'
import { PodTable } from '@/components/pod-table'
import { RefreshButton } from '@/components/refresh-button'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { Terminal } from '@/components/terminal'
import { VolumeTable } from '@/components/volume-table'
import { YamlEditor } from '@/components/yaml-editor'

interface JobStatusBadge {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}

function InfoItem(props: { label: string; value: React.ReactNode }) {
  const { label, value } = props

  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 text-sm font-medium break-words">{value}</div>
    </div>
  )
}

function ResourceBadges(props: {
  value: ReturnType<typeof aggregateContainerResources>['requests']
  emptyText: string
}) {
  const { value, emptyText } = props

  if (!value.cpu && !value.memory) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {value.cpu ? <Badge variant="secondary">CPU: {value.cpu}</Badge> : null}
      {value.memory ? (
        <Badge variant="secondary">Memory: {value.memory}</Badge>
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

function formatSeconds(value?: number) {
  return value === undefined ? undefined : `${value} seconds`
}

function getJobStatusBadge(job?: Job | null): JobStatusBadge {
  if (!job) {
    return { label: '-', variant: 'secondary' }
  }

  const conditions = job.status?.conditions || []
  const completed = conditions.find(
    (condition) => condition.type === 'Complete'
  )
  const failed = conditions.find((condition) => condition.type === 'Failed')

  if (failed?.status === 'True') {
    return { label: 'Failed', variant: 'destructive' }
  }

  if (completed?.status === 'True') {
    return { label: 'Complete', variant: 'default' }
  }

  if ((job.status?.active || 0) > 0) {
    return { label: 'Running', variant: 'secondary' }
  }

  return { label: 'Pending', variant: 'outline' }
}

const getJobDuration = (job?: Job | null): string => {
  if (!job?.status?.startTime) {
    return '-'
  }

  const start = new Date(job.status.startTime)

  if (job.status.completionTime) {
    const end = new Date(job.status.completionTime)
    return formatDistance(end, start)
  }

  return `${formatDistance(new Date(), start)} (running)`
}

export function JobDetail(props: { namespace: string; name: string }) {
  const { namespace, name } = props
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const { t } = useTranslation()

  const {
    data: job,
    isLoading,
    isError,
    error: jobError,
    refetch: refetchJob,
  } = useResource('jobs', name, namespace)

  const { data: pods, refetch: refetchPods } = useResources('pods', namespace, {
    labelSelector: `job-name=${name}`,
    disable: !namespace || !name,
  })

  useEffect(() => {
    if (job) {
      setYamlContent(yaml.dump(job, { indent: 2 }))
    }
  }, [job])

  const jobStatus = useMemo(() => getJobStatusBadge(job), [job])

  const handleManualRefresh = async () => {
    trackResourceAction('jobs', 'refresh')
    setRefreshKey((prev) => prev + 1)
    await Promise.all([refetchJob(), refetchPods()])
  }

  const handleSaveYaml = async (content: Job) => {
    setIsSavingYaml(true)
    try {
      await updateResource('jobs', name, namespace, content)
      trackResourceAction('jobs', 'yaml_save', {
        result: 'success',
      })
      toast.success('Job YAML saved successfully')
      await refetchJob()
      return true
    } catch (error) {
      trackResourceAction('jobs', 'yaml_save', {
        result: 'error',
      })
      toast.error(translateError(error, t))
      return false
    } finally {
      setIsSavingYaml(false)
    }
  }

  const handleYamlChange = (content: string) => {
    setYamlContent(content)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <IconLoader className="animate-spin" />
              <span>
                {t('detail.status.loading', {
                  resource: t('resourceKind.job'),
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !job) {
    return (
      <ErrorMessage
        resourceName={'Job'}
        error={jobError}
        refetch={handleManualRefresh}
      />
    )
  }

  const templateSpec = job.spec?.template?.spec
  const initContainers = templateSpec?.initContainers || []
  const containers = templateSpec?.containers || []
  const volumes = templateSpec?.volumes
  const resources = aggregateContainerResources(containers)
  const notSetText = t('detail.status.notSet')

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{name}</h1>
          <p className="text-muted-foreground">
            {t('detail.fields.namespace')}:{' '}
            <span className="font-medium">{namespace}</span>
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
          <RefreshButton
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
          >
            {t('detail.buttons.refresh')}
          </RefreshButton>
          <DescribeDialog
            resourceType={'jobs'}
            namespace={namespace}
            name={name}
          />
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

      <ResponsiveTabs
        tabs={[
          {
            value: 'overview',
            label: t('detail.tabs.overview'),
            content: (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('detail.sections.statusOverview')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                      <InfoItem
                        label={t('deploymentOverview.currentStatus')}
                        value={
                          <Badge variant={jobStatus.variant}>
                            {jobStatus.label}
                          </Badge>
                        }
                      />
                      <InfoItem
                        label={t('jobs.completions')}
                        value={`${job.status?.succeeded || 0}/${job.spec?.completions || 1}`}
                      />
                      <InfoItem
                        label={t('detail.fields.started')}
                        value={formatTimestampWithRelative(
                          job.status?.startTime
                        )}
                      />
                      <InfoItem
                        label={t('detail.fields.completionTime')}
                        value={
                          job.status?.completionTime
                            ? `${formatTimestampWithRelative(job.status.completionTime)} (${getJobDuration(job)})`
                            : '-'
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t pt-5 md:grid-cols-4">
                      <InfoItem
                        label="Active"
                        value={String(job.status?.active || 0)}
                      />
                      <InfoItem
                        label="Ready"
                        value={String(job.status?.ready || 0)}
                      />
                      <InfoItem
                        label={t('status.failed')}
                        value={String(job.status?.failed || 0)}
                      />
                      <InfoItem
                        label="Terminating"
                        value={String(job.status?.terminating || 0)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('detail.sections.jobInformation')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                      <InfoItem
                        label={t('detail.fields.created')}
                        value={formatTimestampWithRelative(
                          job.metadata?.creationTimestamp
                        )}
                      />
                      <InfoItem
                        label={t('detail.fields.parallelism')}
                        value={String(job.spec?.parallelism ?? 1)}
                      />
                      <InfoItem
                        label={t('detail.fields.backoffLimit')}
                        value={String(job.spec?.backoffLimit ?? 6)}
                      />
                      <InfoItem
                        label={t('detail.fields.activeDeadlineSeconds')}
                        value={
                          formatSeconds(job.spec?.activeDeadlineSeconds) ||
                          notSetText
                        }
                      />
                      {getOwnerInfo(job.metadata) && (
                        <InfoItem
                          label={t('detail.fields.owner')}
                          value={(() => {
                            const ownerInfo = getOwnerInfo(job.metadata)
                            if (!ownerInfo) {
                              return t('detail.fields.noOwner')
                            }
                            return (
                              <Link to={ownerInfo.path} className="app-link">
                                {ownerInfo.kind}/{ownerInfo.name}
                              </Link>
                            )
                          })()}
                        />
                      )}
                      <InfoItem
                        label={t('detail.fields.ttlAfterFinished')}
                        value={
                          formatSeconds(job.spec?.ttlSecondsAfterFinished) ||
                          notSetText
                        }
                      />
                    </div>
                    <LabelsAnno
                      labels={job.metadata?.labels || {}}
                      annotations={job.metadata?.annotations || {}}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pod Template</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                      <InfoItem
                        label={t('deploymentOverview.containersAndImages')}
                        value={
                          <ContainerImagesSummary containers={containers} />
                        }
                      />
                      <InfoItem
                        label={t('deploymentOverview.resourceRequests')}
                        value={
                          <ResourceBadges
                            value={resources.requests}
                            emptyText={notSetText}
                          />
                        }
                      />
                      <InfoItem
                        label={t('deploymentOverview.resourceLimits')}
                        value={
                          <ResourceBadges
                            value={resources.limits}
                            emptyText={notSetText}
                          />
                        }
                      />
                      <InfoItem
                        label={t('deploymentOverview.scheduler')}
                        value={templateSpec?.schedulerName || notSetText}
                      />
                      <InfoItem
                        label="Restart Policy"
                        value={templateSpec?.restartPolicy || notSetText}
                      />
                      <InfoItem
                        label={t('deploymentOverview.serviceLinks')}
                        value={
                          templateSpec?.enableServiceLinks === false
                            ? t('deploymentOverview.disabled')
                            : t('deploymentOverview.enabled')
                        }
                      />
                    </div>
                    <LabelsAnno
                      labels={job.spec?.template?.metadata?.labels || {}}
                      annotations={
                        job.spec?.template?.metadata?.annotations || {}
                      }
                    />
                  </CardContent>
                </Card>

                {initContainers.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {t('detail.sections.initContainers')} (
                        {initContainers.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {initContainers.map((container) => (
                          <ContainerTable
                            key={container.name}
                            container={container}
                            init
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {containers.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {t('detail.sections.containers')} ({containers.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {containers.map((container) => (
                          <ContainerTable
                            key={container.name}
                            container={container}
                          />
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
              <YamlEditor<'jobs'>
                key={refreshKey}
                value={yamlContent}
                title={t('yamlEditor.title')}
                onSave={handleSaveYaml}
                onChange={handleYamlChange}
                isSaving={isSavingYaml}
              />
            ),
          },
          ...(pods && pods.length > 0
            ? [
                {
                  value: 'pods',
                  label: (
                    <>
                      {t('nav.pods')}{' '}
                      {pods && <Badge variant="secondary">{pods.length}</Badge>}
                    </>
                  ),
                  content: <PodTable pods={pods} />,
                },
                {
                  value: 'logs',
                  label: t('detail.tabs.logs'),
                  content: (
                    <div className="space-y-6">
                      <LogViewer
                        namespace={namespace}
                        pods={pods}
                        containers={job.spec?.template.spec?.containers}
                        initContainers={job.spec?.template.spec?.initContainers}
                        labelSelector={`job-name=${name}`}
                      />
                    </div>
                  ),
                },
                {
                  value: 'terminal',
                  label: t('detail.tabs.terminal'),
                  content: (
                    <div className="space-y-6">
                      <Terminal
                        namespace={namespace}
                        pods={pods}
                        containers={job.spec?.template.spec?.containers}
                        initContainers={job.spec?.template.spec?.initContainers}
                      />
                    </div>
                  ),
                },
              ]
            : []),
          {
            value: 'related',
            label: t('detail.tabs.related'),
            content: (
              <RelatedResourcesTable
                resource={'jobs'}
                name={name}
                namespace={namespace}
              />
            ),
          },
          {
            value: 'events',
            label: t('detail.tabs.events'),
            content: (
              <EventTable resource="jobs" name={name} namespace={namespace} />
            ),
          },
          {
            value: 'history',
            label: t('detail.tabs.history'),
            content: (
              <ResourceHistoryTable
                resourceType="jobs"
                name={name}
                namespace={namespace}
                currentResource={job}
              />
            ),
          },
          ...(volumes
            ? [
                {
                  value: 'volumes',
                  label: t('detail.tabs.volumes'),
                  content: (
                    <VolumeTable
                      namespace={namespace}
                      volumes={volumes}
                      containers={containers}
                    />
                  ),
                } as const,
              ]
            : []),
          {
            value: 'monitor',
            label: t('detail.tabs.monitor'),
            content: (
              <PodMonitoring
                namespace={namespace}
                pods={pods}
                containers={job.spec?.template.spec?.containers}
                initContainers={job.spec?.template.spec?.initContainers}
                labelSelector={`job-name=${name}`}
              />
            ),
          },
        ]}
      />

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={name}
        resourceType="jobs"
        namespace={namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </div>
  )
}
