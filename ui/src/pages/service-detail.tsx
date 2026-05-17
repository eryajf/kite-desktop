import { useEffect, useState } from 'react'
import { IconExternalLink, IconLoader, IconTrash } from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import {
  EndpointPort,
  Endpoints,
  Pod,
  Service,
} from 'kubernetes-types/core/v1'
import {
  EndpointSlice,
  EndpointPort as SliceEndpointPort,
} from 'kubernetes-types/discovery/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { ResourceType } from '@/types/api'
import { trackResourceAction } from '@/lib/analytics'
import { updateResource, useResource, useResources } from '@/lib/api'
import { getOwnerInfo, getPodStatus } from '@/lib/k8s'
import { withSubPath } from '@/lib/subpath'
import { formatDate, translateError } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toCompactImageName } from '@/components/container-images-summary'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { RefreshButton } from '@/components/refresh-button'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { YamlEditor } from '@/components/yaml-editor'

function formatPortValue(value?: string | number) {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  return String(value)
}

function formatSelector(selector?: Record<string, string>) {
  return Object.entries(selector || {})
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
}

function formatEndpointPort(port: EndpointPort) {
  return [port.name, port.port, port.protocol || 'TCP'].filter(Boolean).join(' ')
}

function formatSliceEndpointPort(port: SliceEndpointPort) {
  return [port.name, port.port ?? '*', port.protocol || 'TCP']
    .filter(Boolean)
    .join(' ')
}

function getPodImages(pod: Pod) {
  const images = pod.spec?.containers?.map((container) => container.image || '-')
  return images?.map(toCompactImageName).join(', ') || '-'
}

function getPodReadyText(pod: Pod) {
  const status = getPodStatus(pod)
  return `${status.readyContainers}/${status.totalContainers}`
}

function isPodReady(pod: Pod) {
  const status = getPodStatus(pod)
  return (
    status.totalContainers > 0 &&
    status.readyContainers === status.totalContainers &&
    !pod.metadata?.deletionTimestamp
  )
}

function EmptyAssociationRow({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation()

  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="h-16 text-center text-sm text-muted-foreground"
      >
        {t('common.noData', 'No data')}
      </TableCell>
    </TableRow>
  )
}

function PodAssociationTable({
  pods,
  showBottomBorder = true,
}: {
  pods: Pod[]
  showBottomBorder?: boolean
}) {
  const { t } = useTranslation()

  return (
    <Table containerClassName={showBottomBorder ? 'border-b' : undefined}>
      <TableHeader className="bg-muted">
        <TableRow>
          <TableHead>{t('common.name')}</TableHead>
          <TableHead>{t('detail.fields.labels')}</TableHead>
          <TableHead>{t('services.containerCount')}</TableHead>
          <TableHead>{t('services.images')}</TableHead>
          <TableHead>{t('detail.fields.created')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pods.length === 0 ? (
          <EmptyAssociationRow colSpan={5} />
        ) : (
          pods.map((pod) => (
            <TableRow key={pod.metadata?.uid || pod.metadata?.name}>
              <TableCell>
                <Link
                  to={`/pods/${pod.metadata?.namespace}/${pod.metadata?.name}`}
                  className="app-link"
                >
                  {pod.metadata?.name}
                </Link>
              </TableCell>
              <TableCell className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">
                {formatSelector(pod.metadata?.labels) || '-'}
              </TableCell>
              <TableCell className="font-mono">{getPodReadyText(pod)}</TableCell>
              <TableCell className="max-w-[420px] truncate font-mono text-xs">
                {getPodImages(pod)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatDate(pod.metadata?.creationTimestamp || '')}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

function ServiceAssociationsOverview({
  service,
  namespace,
}: {
  service: Service
  namespace?: string
}) {
  const { t } = useTranslation()
  const selector = formatSelector(service.spec?.selector)
  const serviceName = service.metadata?.name || ''
  const { data: endpoints } = useResource('endpoints', serviceName, namespace, {
    staleTime: 1000,
  })
  const { data: endpointSlices = [] } = useResources('endpointslices', namespace, {
    labelSelector: serviceName
      ? `kubernetes.io/service-name=${serviceName}`
      : undefined,
    disable: !namespace || !serviceName,
  })
  const { data: pods = [] } = useResources('pods', namespace, {
    labelSelector: selector || undefined,
    disable: !namespace || !selector,
  })

  const endpointRows = getEndpointRows(endpoints, endpointSlices)
  const readyPods = pods.filter(isPodReady)
  const notReadyPods = pods.filter((pod) => !isPodReady(pod))

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t('services.endpoints')}</h3>
        <Table containerClassName="border-b">
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>{t('services.ip')}</TableHead>
              <TableHead>{t('detail.fields.ports')}</TableHead>
              <TableHead>{t('services.node')}</TableHead>
              <TableHead>{t('services.target')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpointRows.length === 0 ? (
              <EmptyAssociationRow colSpan={4} />
            ) : (
              endpointRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-mono">{row.ip}</TableCell>
                  <TableCell className="font-mono text-xs">{row.ports}</TableCell>
                  <TableCell>{row.nodeName}</TableCell>
                  <TableCell>
                    {row.targetKind === 'Pod' && row.targetName !== '-' ? (
                      <Link
                        to={`/pods/${namespace}/${row.targetName}`}
                        className="app-link"
                      >
                        {row.targetName}
                      </Link>
                    ) : (
                      row.targetName
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t('services.notReadyPods')}</h3>
        <PodAssociationTable pods={notReadyPods} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t('services.readyPods')}</h3>
        <PodAssociationTable pods={readyPods} showBottomBorder={false} />
      </section>
    </div>
  )
}

function getEndpointRows(
  endpoints: Endpoints | undefined,
  endpointSlices: EndpointSlice[]
) {
  const endpointRows =
    endpoints?.subsets?.flatMap((subset, subsetIndex) =>
      [
        ...(subset.addresses || []).map((address) => ({
          address,
          ready: true,
        })),
        ...(subset.notReadyAddresses || []).map((address) => ({
          address,
          ready: false,
        })),
      ].map(({ address, ready }, addressIndex) => ({
        key: `endpoints-${endpoints.metadata?.uid || endpoints.metadata?.name}-${subsetIndex}-${addressIndex}-${ready ? 'ready' : 'not-ready'}`,
        ip: address.ip,
        nodeName: address.nodeName || '-',
        targetName: address.targetRef?.name || '-',
        targetKind: address.targetRef?.kind || '',
        ports: (subset.ports || []).map(formatEndpointPort).join(', ') || '-',
      }))
    )

  if (endpointRows?.length) {
    return endpointRows
  }

  return endpointSlices.flatMap((slice) =>
    (slice.endpoints || []).flatMap((endpoint, endpointIndex) =>
      (endpoint.addresses || []).map((address, addressIndex) => ({
        key: `slice-${slice.metadata?.uid || slice.metadata?.name}-${endpointIndex}-${addressIndex}`,
        ip: address,
        nodeName: endpoint.nodeName || '-',
        targetName: endpoint.targetRef?.name || '-',
        targetKind: endpoint.targetRef?.kind || '',
        ports: (slice.ports || []).map(formatSliceEndpointPort).join(', ') || '-',
      }))
    )
  )
}

function ServicePortsOverview({
  service,
  name,
  namespace,
}: {
  service: Service
  name: string
  namespace?: string
}) {
  const { t } = useTranslation()
  const ports = service.spec?.ports || []

  if (ports.length === 0) {
    return (
      <div>
        <Label className="text-xs text-muted-foreground">
          {t('detail.fields.ports')}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('detail.fields.noPortsDefined')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs text-muted-foreground">
          {t('detail.fields.ports')}
        </Label>
        <Badge variant="outline">{ports.length}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {ports.map((port, index) => {
          const protocol = port.protocol || 'TCP'
          const portName = port.name || `${t('services.port')} ${index + 1}`
          const proxyURL = withSubPath(
            `/api/v1/namespaces/${namespace}/services/${name}:${port.port}/proxy/`
          )

          return (
            <div
              key={`${port.name || 'port'}-${port.port}-${protocol}-${index}`}
              className="rounded-md border bg-muted/20 p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-medium">
                    {portName}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {protocol}
                  </div>
                </div>
                <a
                  href={proxyURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-link inline-flex shrink-0 items-center gap-1 text-xs"
                >
                  {t('services.proxy')}
                  <IconExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-md bg-background px-2.5 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    {t('services.servicePort')}
                  </div>
                  <div className="mt-1 font-mono text-sm">{port.port}</div>
                </div>
                <div className="rounded-md bg-background px-2.5 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    {t('services.targetPort')}
                  </div>
                  <div className="mt-1 min-w-0 break-all font-mono text-sm">
                    {formatPortValue(port.targetPort)}
                  </div>
                </div>
                <div className="rounded-md bg-background px-2.5 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    {t('services.nodePort')}
                  </div>
                  <div className="mt-1 font-mono text-sm">
                    {formatPortValue(port.nodePort)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ServiceDetail(props: { name: string; namespace?: string }) {
  const { namespace, name } = props
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const { t } = useTranslation()

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: handleRefresh,
  } = useResource('services', name, namespace)

  useEffect(() => {
    if (data) {
      setYamlContent(yaml.dump(data, { indent: 2 }))
    }
  }, [data])

  const handleSaveYaml = async (content: Service) => {
    setIsSavingYaml(true)
    try {
      await updateResource('services', name, namespace, content)
      trackResourceAction('services', 'yaml_save', {
        result: 'success',
      })
      toast.success(t('detail.status.yamlSaved'))
      // Refresh data after successful save
      await handleRefresh()
      return true
    } catch (error) {
      trackResourceAction('services', 'yaml_save', {
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

  const handleManualRefresh = async () => {
    trackResourceAction('services', 'refresh')
    // Increment refresh key to force YamlEditor re-render
    setRefreshKey((prev) => prev + 1)
    await handleRefresh()
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
                  resource: t('resourceKind.service'),
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <ErrorMessage
        resourceName={'service'}
        error={error}
        refetch={handleRefresh}
      />
    )
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{name}</h1>
          {namespace && (
            <p className="text-muted-foreground">
              {t('detail.fields.namespace')}:{' '}
              <span className="font-medium">{namespace}</span>
            </p>
          )}
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
            resourceType={'services' as ResourceType}
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
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('detail.sections.serviceInformation')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.created')}
                        </Label>
                        <p className="text-sm">
                          {formatDate(data.metadata?.creationTimestamp || '')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.uid')}
                        </Label>
                        <p className="text-sm font-mono">
                          {data.metadata?.uid || t('detail.fields.na')}
                        </p>
                      </div>
                      {getOwnerInfo(data.metadata) && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            {t('detail.fields.owner')}
                          </Label>
                          <p className="text-sm">
                            {(() => {
                              const ownerInfo = getOwnerInfo(data.metadata)
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
                    </div>
                    <ServicePortsOverview
                      service={data}
                      name={name}
                      namespace={namespace}
                    />
                    <div className="border-t" />
                    <ServiceAssociationsOverview
                      service={data}
                      namespace={namespace}
                    />
                    <LabelsAnno
                      labels={data.metadata?.labels || {}}
                      annotations={data.metadata?.annotations || {}}
                    />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: 'yaml',
            label: t('detail.tabs.yaml'),
            content: (
              <div className="space-y-4">
                <YamlEditor<'services'>
                  key={refreshKey}
                  value={yamlContent}
                  title={t('yamlEditor.title')}
                  onSave={handleSaveYaml}
                  onChange={handleYamlChange}
                  isSaving={isSavingYaml}
                />
              </div>
            ),
          },
          {
            value: 'Related',
            label: t('detail.tabs.related'),
            content: (
              <RelatedResourcesTable
                resource={'services'}
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
                resource={'services'}
                namespace={namespace}
                name={name}
              />
            ),
          },
          {
            value: 'history',
            label: t('detail.tabs.history'),
            content: (
              <ResourceHistoryTable<'services'>
                resourceType={'services'}
                name={name}
                namespace={namespace}
                currentResource={data}
              />
            ),
          },
        ]}
      />

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={name}
        resourceType="services"
        namespace={namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </div>
  )
}
