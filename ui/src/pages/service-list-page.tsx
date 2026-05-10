import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Service } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, Tags, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { getServiceExternalIP } from '@/lib/k8s'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  MetadataSummaryButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

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

const serviceColumnHelper = createColumnHelper<Service>()

export function ServiceListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsService, setLabelsService] = useState<Service | null>(null)
  const [annotationsService, setAnnotationsService] = useState<Service | null>(
    null
  )
  // Define columns for the service table
  const columns = useMemo(
    () => [
      serviceColumnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/services/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      serviceColumnHelper.accessor('spec.type', {
        header: t('services.type'),
        enableColumnFilter: true,
        cell: ({ getValue }) => {
          const type = getValue() || 'ClusterIP'
          return <Badge variant="outline">{type}</Badge>
        },
      }),
      serviceColumnHelper.accessor('spec.clusterIP', {
        header: t('services.clusterIP'),
        cell: ({ getValue }) => {
          const val = getValue() || '-'
          return (
            <span className="font-mono text-sm text-muted-foreground">
              {val}
            </span>
          )
        },
      }),
      serviceColumnHelper.accessor('status.loadBalancer.ingress', {
        header: t('services.externalIP'),
        cell: ({ row }) => {
          const val = getServiceExternalIP(row.original)
          return (
            <span className="font-mono text-sm text-muted-foreground">
              {val}
            </span>
          )
        },
      }),
      serviceColumnHelper.accessor('spec.ports', {
        header: t('services.ports'),
        cell: ({ getValue }) => {
          const ports = getValue() || []
          if (ports.length === 0) return '-'
          const text = ports
            .map((port) => {
              const protocol = port.protocol || 'TCP'
              if (port.nodePort) {
                return `${port.port}:${port.nodePort}/${protocol}`
              }
              return `${port.port}/${protocol}`
            })
            .join(', ')
          return (
            <span className="font-mono text-sm text-muted-foreground">
              {text}
            </span>
          )
        },
      }),
      serviceColumnHelper.display({
        id: 'labels',
        header: t('detail.fields.labels'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="labels"
            ariaLabel={t('serviceList.manageLabels')}
            count={Object.keys(row.original.metadata?.labels || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.labels
            )}
            onClick={() => setLabelsService(row.original)}
          />
        ),
      }),
      serviceColumnHelper.display({
        id: 'annotations',
        header: t('detail.fields.annotations'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="annotations"
            ariaLabel={t('serviceList.manageAnnotations')}
            count={Object.keys(row.original.metadata?.annotations || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.metadata?.annotations
            )}
            onClick={() => setAnnotationsService(row.original)}
          />
        ),
      }),
      serviceColumnHelper.display({
        id: 'selector',
        header: t('detail.fields.selector'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataSummaryButton
            ariaLabel={t('serviceList.viewSelector')}
            count={Object.keys(row.original.spec?.selector || {}).length}
            tooltipContent={renderMetadataTooltipContent(
              row.original.spec?.selector
            )}
          >
            <Workflow className="h-4 w-4" />
          </MetadataSummaryButton>
        ),
      }),
      serviceColumnHelper.accessor('metadata.creationTimestamp', {
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
    [t]
  )

  // Custom filter for service search
  const serviceSearchFilter = useCallback((service: Service, query: string) => {
    return (
      service.metadata!.name!.toLowerCase().includes(query) ||
      (service.spec!.type?.toLowerCase() || '').includes(query) ||
      (service.spec!.clusterIP?.toLowerCase() || '').includes(query) ||
      includesRecordText(service.metadata?.labels, query) ||
      includesRecordText(service.metadata?.annotations, query) ||
      includesRecordText(service.spec?.selector, query)
    )
  }, [])

  const getServiceDetailPath = useCallback((service: Service) => {
    return `/services/${service.metadata!.namespace}/${service.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (service: Service): RowContextMenuItem<Service>[] => {
      const clusterIP = service.spec?.clusterIP

      return [
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${getServiceDetailPath(service)}?tab=yaml`),
        },
        { type: 'separator', key: 'primary-actions-separator' },
        {
          key: 'copy-name',
          label: t('common.copyName', 'Copy name'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(service.metadata?.name || ''),
        },
        {
          key: 'copy-namespace',
          label: t('common.copyNamespace', 'Copy namespace'),
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => handleCopy(service.metadata?.namespace || ''),
        },
        {
          key: 'copy-cluster-ip',
          label: t('services.copyClusterIP', 'Copy ClusterIP'),
          icon: <Copy className="h-4 w-4" />,
          disabled: !clusterIP || clusterIP === 'None',
          onSelect: () => handleCopy(clusterIP || ''),
        },
        { type: 'separator', key: 'metadata-actions-separator' },
        {
          key: 'manage-labels',
          label: t('common.manageLabels', 'Manage labels'),
          icon: <Tags className="h-4 w-4" />,
          onSelect: () => setLabelsService(service),
        },
        {
          key: 'manage-annotations',
          label: t('common.manageAnnotations', 'Manage annotations'),
          icon: <FileText className="h-4 w-4" />,
          onSelect: () => setAnnotationsService(service),
        },
      ]
    },
    [getServiceDetailPath, handleCopy, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName="Services"
        columns={columns}
        clusterScope={false} // Services are namespace-scoped
        searchQueryFilter={serviceSearchFilter}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsService)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsService(null)
          }
        }}
        resourceType="services"
        resource={labelsService}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsService)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsService(null)
          }
        }}
        resourceType="services"
        resource={annotationsService}
        type="annotations"
      />
    </>
  )
}
