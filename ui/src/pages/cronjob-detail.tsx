import { useEffect, useMemo, useState } from 'react'
import {
  IconLoader,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerPlayFilled,
  IconTrash,
} from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import { CronJob, Job } from 'kubernetes-types/batch/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { trackResourceAction } from '@/lib/analytics'
import {
  createResource,
  updateResource,
  useResource,
  useResources,
} from '@/lib/api'
import { aggregateContainerResources } from '@/lib/k8s'
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
import { RefreshButton } from '@/components/refresh-button'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { Column, SimpleTable } from '@/components/simple-table'
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

function getJobStatusBadge(job: Job): JobStatusBadge {
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

export function CronJobDetail(props: { namespace: string; name: string }) {
  const { namespace, name } = props
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isTogglingSuspend, setIsTogglingSuspend] = useState(false)
  const [isRunningNow, setIsRunningNow] = useState(false)
  const { t } = useTranslation()

  const {
    data: cronjob,
    isLoading,
    isError,
    error: cronJobError,
    refetch: refetchCronJob,
  } = useResource('cronjobs', name, namespace)

  const {
    data: jobs,
    isLoading: isLoadingJobs,
    refetch: refetchJobs,
  } = useResources('jobs', namespace, {
    disable: !namespace,
  })

  useEffect(() => {
    if (cronjob) {
      setYamlContent(yaml.dump(cronjob, { indent: 2 }))
    }
  }, [cronjob])

  const cronJobStatus = useMemo(() => {
    if (!cronjob) {
      return { label: '-', variant: 'secondary' as const }
    }

    if (cronjob.spec?.suspend) {
      return { label: 'Suspended', variant: 'secondary' as const }
    }

    if ((cronjob.status?.active?.length || 0) > 0) {
      return { label: 'Active', variant: 'default' as const }
    }

    if (cronjob.status?.lastSuccessfulTime) {
      return { label: 'Idle', variant: 'outline' as const }
    }

    return { label: 'Pending', variant: 'outline' as const }
  }, [cronjob])

  const cronJobJobs = useMemo(() => {
    if (!jobs) {
      return [] as Job[]
    }

    return jobs.filter((job) =>
      job.metadata?.ownerReferences?.some(
        (owner) => owner.kind === 'CronJob' && owner.name === name
      )
    )
  }, [jobs, name])

  const sortedJobs = useMemo(() => {
    return [...cronJobJobs].sort((a, b) => {
      const aTime = new Date(a.metadata?.creationTimestamp || 0).getTime()
      const bTime = new Date(b.metadata?.creationTimestamp || 0).getTime()
      return bTime - aTime
    })
  }, [cronJobJobs])

  const activeJobs = useMemo(() => {
    if (!cronjob) {
      return [] as Job[]
    }
    const activeNames = new Set(
      (cronjob.status?.active || [])
        .map((ref) => ref.name)
        .filter((val): val is string => Boolean(val))
    )

    return cronJobJobs.filter((job) =>
      activeNames.has(job.metadata?.name || '')
    )
  }, [cronjob, cronJobJobs])

  const jobColumns = useMemo<Column<Job>[]>(
    () => [
      {
        header: 'Name',
        accessor: (job) => job,
        align: 'left',
        cell: (value) => {
          const job = value as Job
          return (
            <Link
              to={`/jobs/${job.metadata?.namespace}/${job.metadata?.name}`}
              className="app-link"
            >
              {job.metadata?.name}
            </Link>
          )
        },
      },
      {
        header: 'Status',
        accessor: (job) => getJobStatusBadge(job),
        cell: (value) => {
          const badge = value as JobStatusBadge
          return <Badge variant={badge.variant}>{badge.label}</Badge>
        },
      },
      {
        header: 'Succeeded',
        accessor: (job) => {
          const succeeded = job.status?.succeeded || 0
          const completions = job.spec?.completions || 1
          return `${succeeded}/${completions}`
        },
        cell: (value) => <span className="text-sm">{value as string}</span>,
      },
      {
        header: 'Started',
        accessor: (job) => job.status?.startTime,
        cell: (value) =>
          value ? (
            <span className="text-sm text-muted-foreground">
              {formatDate(value as string)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          ),
      },
      {
        header: 'Completed',
        accessor: (job) => job.status?.completionTime,
        cell: (value) =>
          value ? (
            <span className="text-sm text-muted-foreground">
              {formatDate(value as string)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          ),
      },
    ],
    []
  )

  const handleManualRefresh = async () => {
    trackResourceAction('cronjobs', 'refresh')
    setRefreshKey((prev) => prev + 1)
    await Promise.all([refetchCronJob(), refetchJobs()])
  }

  const handleSaveYaml = async (content: CronJob) => {
    setIsSavingYaml(true)
    try {
      await updateResource('cronjobs', name, namespace, content)
      trackResourceAction('cronjobs', 'yaml_save', {
        result: 'success',
      })
      toast.success('CronJob YAML saved successfully')
      await refetchCronJob()
      return true
    } catch (error) {
      trackResourceAction('cronjobs', 'yaml_save', {
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

  const handleToggleSuspend = async () => {
    if (!cronjob || !cronjob.spec) {
      toast.error('CronJob spec is missing, unable to update suspend state')
      return
    }

    const action = cronjob.spec?.suspend ? 'resume' : 'suspend'
    setIsTogglingSuspend(true)
    try {
      const updatedCronJob = JSON.parse(JSON.stringify(cronjob)) as CronJob
      updatedCronJob.spec!.suspend = !(cronjob.spec?.suspend ?? false)
      await updateResource('cronjobs', name, namespace, updatedCronJob)
      trackResourceAction('cronjobs', action, {
        result: 'success',
      })
      toast.success(
        updatedCronJob.spec?.suspend ? 'CronJob suspended' : 'CronJob resumed'
      )
      await Promise.all([refetchCronJob(), refetchJobs()])
    } catch (error) {
      trackResourceAction('cronjobs', action, {
        result: 'error',
      })
      toast.error(translateError(error, t))
    } finally {
      setIsTogglingSuspend(false)
    }
  }

  const handleRunNow = async () => {
    if (!cronjob?.spec?.jobTemplate?.spec || !namespace) {
      toast.error('CronJob template is incomplete, unable to run now')
      return
    }

    setIsRunningNow(true)
    try {
      const jobTemplateSpec = JSON.parse(
        JSON.stringify(cronjob.spec.jobTemplate.spec)
      ) as Job['spec']

      const manualJob: Job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          namespace,
          name: `${name}-manual-${Date.now()}`,
          labels: {
            ...(cronjob.spec.jobTemplate.metadata?.labels || {}),
            'cronjob.kubernetes.io/name': name,
          },
          annotations: {
            ...(cronjob.spec.jobTemplate.metadata?.annotations || {}),
            'kite.kubernetes.io/run-now': new Date().toISOString(),
          },
          ownerReferences: cronjob.metadata?.uid
            ? [
                {
                  apiVersion: cronjob.apiVersion || 'batch/v1',
                  kind: 'CronJob',
                  name,
                  uid: cronjob.metadata.uid,
                  controller: true,
                  blockOwnerDeletion: true,
                },
              ]
            : undefined,
        },
        spec: jobTemplateSpec,
      }

      await createResource('jobs', namespace, manualJob)
      trackResourceAction('cronjobs', 'run_now', {
        result: 'success',
      })
      toast.success('Job created successfully')
      await refetchJobs()
    } catch (error) {
      trackResourceAction('cronjobs', 'run_now', {
        result: 'error',
      })
      toast.error(translateError(error, t))
    } finally {
      setIsRunningNow(false)
    }
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
                  resource: t('resourceKind.cronjob'),
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !cronjob) {
    return (
      <ErrorMessage
        resourceName={'CronJob'}
        error={cronJobError}
        refetch={handleManualRefresh}
      />
    )
  }

  const templateSpec =
    cronjob.spec?.jobTemplate?.spec?.template?.spec || undefined
  const initContainers = templateSpec?.initContainers || []
  const containers = templateSpec?.containers || []
  const volumes = templateSpec?.volumes
  const resources = aggregateContainerResources(containers)
  const notSetText = t('detail.status.notSet')

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
          <RefreshButton
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
          >
            {t('detail.buttons.refresh')}
          </RefreshButton>
          <DescribeDialog
            resourceType={'cronjobs'}
            namespace={namespace}
            name={name}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunNow}
            disabled={isRunningNow}
          >
            <IconPlayerPlayFilled className="w-4 h-4" />
            Run Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleSuspend}
            disabled={isTogglingSuspend}
          >
            {cronjob.spec?.suspend ? (
              <IconPlayerPlay className="w-4 h-4" />
            ) : (
              <IconPlayerPause className="w-4 h-4" />
            )}
            {cronjob.spec?.suspend ? 'Resume' : 'Suspend'}
          </Button>
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
                          <Badge variant={cronJobStatus.variant}>
                            {cronJobStatus.label}
                          </Badge>
                        }
                      />
                      <InfoItem
                        label={t('cronjobs.schedule')}
                        value={cronjob.spec?.schedule || '-'}
                      />
                      <InfoItem
                        label={t('detail.fields.activeJobs')}
                        value={String(cronjob.status?.active?.length || 0)}
                      />
                      <InfoItem
                        label={t('detail.fields.lastSchedule')}
                        value={formatTimestampWithRelative(
                          cronjob.status?.lastScheduleTime
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-t pt-5 md:grid-cols-2 xl:grid-cols-4">
                      <InfoItem
                        label={t('cronjobs.lastSuccess')}
                        value={formatTimestampWithRelative(
                          cronjob.status?.lastSuccessfulTime
                        )}
                      />
                      <InfoItem
                        label={t('detail.fields.concurrencyPolicy')}
                        value={cronjob.spec?.concurrencyPolicy || 'Allow'}
                      />
                      <InfoItem
                        label={t('detail.fields.timeZone')}
                        value={cronjob.spec?.timeZone || notSetText}
                      />
                      <InfoItem
                        label={t('detail.fields.created')}
                        value={formatTimestampWithRelative(
                          cronjob.metadata?.creationTimestamp
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('detail.sections.cronJobInformation')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                      <InfoItem
                        label={t('detail.fields.startingDeadline')}
                        value={
                          formatSeconds(
                            cronjob.spec?.startingDeadlineSeconds
                          ) || notSetText
                        }
                      />
                      <InfoItem
                        label={t('detail.fields.successfulJobsHistory')}
                        value={String(
                          cronjob.spec?.successfulJobsHistoryLimit ?? 3
                        )}
                      />
                      <InfoItem
                        label={t('detail.fields.failedJobsHistory')}
                        value={String(
                          cronjob.spec?.failedJobsHistoryLimit ?? 1
                        )}
                      />
                      <InfoItem
                        label={t('detail.fields.parallelism')}
                        value={String(
                          cronjob.spec?.jobTemplate?.spec?.parallelism ?? 1
                        )}
                      />
                      <InfoItem
                        label={t('detail.fields.backoffLimit')}
                        value={String(
                          cronjob.spec?.jobTemplate?.spec?.backoffLimit ?? 6
                        )}
                      />
                      <InfoItem
                        label={t('detail.fields.ttlAfterFinished')}
                        value={
                          formatSeconds(
                            cronjob.spec?.jobTemplate?.spec
                              ?.ttlSecondsAfterFinished
                          ) || notSetText
                        }
                      />
                    </div>
                    <LabelsAnno
                      labels={cronjob.metadata?.labels || {}}
                      annotations={cronjob.metadata?.annotations || {}}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Job Template</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <LabelsAnno
                      labels={cronjob.spec?.jobTemplate?.metadata?.labels || {}}
                      annotations={
                        cronjob.spec?.jobTemplate?.metadata?.annotations || {}
                      }
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
                      labels={
                        cronjob.spec?.jobTemplate?.spec?.template?.metadata
                          ?.labels || {}
                      }
                      annotations={
                        cronjob.spec?.jobTemplate?.spec?.template?.metadata
                          ?.annotations || {}
                      }
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('detail.sections.activeJobs')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingJobs ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconLoader className="w-4 h-4 animate-spin" />
                        {t('common.loading')}
                      </div>
                    ) : activeJobs.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {activeJobs.map((job) => (
                          <Badge key={job.metadata?.uid} variant="secondary">
                            <Link
                              to={`/jobs/${job.metadata?.namespace}/${job.metadata?.name}`}
                              className="hover:underline"
                            >
                              {job.metadata?.name}
                            </Link>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No active jobs currently running.
                      </p>
                    )}
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

                <Card>
                  <CardHeader>
                    <CardTitle>Containers ({containers.length})</CardTitle>
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
              </div>
            ),
          },
          {
            value: 'yaml',
            label: t('detail.tabs.yaml'),
            content: (
              <YamlEditor<'cronjobs'>
                key={refreshKey}
                value={yamlContent}
                title={t('yamlEditor.title')}
                onSave={handleSaveYaml}
                onChange={handleYamlChange}
                isSaving={isSavingYaml}
              />
            ),
          },
          {
            value: 'jobs',
            label: (
              <>
                Jobs{' '}
                {cronJobJobs && (
                  <Badge variant="secondary">{cronJobJobs.length}</Badge>
                )}
              </>
            ),
            content: (
              <Card>
                <CardContent>
                  <SimpleTable<Job>
                    data={sortedJobs}
                    columns={jobColumns}
                    emptyMessage="No jobs found for this CronJob"
                    pagination={{
                      enabled: true,
                      pageSize: 20,
                      showPageInfo: true,
                    }}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            value: 'related',
            label: t('detail.tabs.related'),
            content: (
              <RelatedResourcesTable
                resource={'cronjobs'}
                name={name}
                namespace={namespace}
              />
            ),
          },
          {
            value: 'events',
            label: t('detail.tabs.events'),
            content: (
              <EventTable
                resource="cronjobs"
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
                resourceType="cronjobs"
                name={name}
                namespace={namespace}
                currentResource={cronjob}
              />
            ),
          },
          ...(volumes
            ? [
                {
                  value: 'volumes',
                  label: 'Volumes',
                  content: (
                    <VolumeTable
                      namespace={namespace}
                      volumes={volumes}
                      containers={containers}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={name}
        resourceType="cronjobs"
        namespace={namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </div>
  )
}
