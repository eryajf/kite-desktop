import { useEffect, useMemo, useState } from 'react'
import { IconLoader, IconRefresh, IconTrash } from '@tabler/icons-react'
import { formatDistance } from 'date-fns'
import * as yaml from 'js-yaml'
import { Job } from 'kubernetes-types/batch/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { updateResource, useResource, useResources } from '@/lib/api'
import { getOwnerInfo } from '@/lib/k8s'
import { formatDate, translateError } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { ContainerTable } from '@/components/container-table'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { LogViewer } from '@/components/log-viewer'
import { PodMonitoring } from '@/components/pod-monitoring'
import { PodTable } from '@/components/pod-table'
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
    setRefreshKey((prev) => prev + 1)
    await Promise.all([refetchJob(), refetchPods()])
  }

  const handleSaveYaml = async (content: Job) => {
    setIsSavingYaml(true)
    try {
      await updateResource('jobs', name, namespace, content)
      toast.success('Job YAML saved successfully')
      await refetchJob()
    } catch (error) {
      toast.error(translateError(error, t))
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
          <Button variant="outline" size="sm" onClick={handleManualRefresh}>
            <IconRefresh className="w-4 h-4" />
            {t('detail.buttons.refresh')}
          </Button>
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
                  <CardContent>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Status
                        </Label>
                        <Badge variant={jobStatus.variant}>
                          {jobStatus.label}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Completions
                        </Label>
                        <p className="text-sm font-medium">
                          {`${job.status?.succeeded || 0}/${job.spec?.completions || 1}`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Start Time
                        </Label>
                        <p className="text-sm font-medium">
                          {job.status?.startTime
                            ? formatDate(job.status.startTime, false)
                            : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          {t('detail.fields.completionTime')}
                        </Label>
                        <p className="text-sm font-medium">
                          {job.status?.completionTime
                            ? `${formatDate(job.status.completionTime, false)} (duration: ${getJobDuration(job)})`
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('detail.sections.jobInformation')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground ">
                          {t('detail.fields.created')}
                        </Label>
                        <p className="text-sm">
                          {formatDate(
                            job.metadata?.creationTimestamp || '',
                            true
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.parallelism')}
                        </Label>
                        <p className="text-sm">{job.spec?.parallelism ?? 1}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.backoffLimit')}
                        </Label>
                        <p className="text-sm">{job.spec?.backoffLimit ?? 6}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.activeDeadlineSeconds')}
                        </Label>
                        <p className="text-sm">
                          {job.spec?.activeDeadlineSeconds
                            ? `${job.spec.activeDeadlineSeconds} seconds`
                            : t('detail.status.notSet')}
                        </p>
                      </div>
                      {getOwnerInfo(job.metadata) && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            {t('detail.fields.owner')}
                          </Label>
                          <p className="text-sm">
                            {(() => {
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
                          </p>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.ttlAfterFinished')}
                        </Label>
                        <p className="text-sm">
                          {job.spec?.ttlSecondsAfterFinished
                            ? `${job.spec.ttlSecondsAfterFinished} seconds`
                            : t('detail.status.notSet')}
                        </p>
                      </div>
                    </div>
                    <LabelsAnno
                      labels={job.metadata?.labels || {}}
                      annotations={job.metadata?.annotations || {}}
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
