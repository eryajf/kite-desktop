import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Service } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, Tags, Trash2, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  MetadataActionButton,
  MetadataSummaryButton,
  renderMetadataTooltipContent,
} from '@/components/metadata-action-button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ResourceTable } from '@/components/resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
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

function getServiceExternalIPItems(service: Service): string[] {
  const spec = service.spec

  switch (spec?.type || 'ClusterIP') {
    case 'LoadBalancer': {
      const ingress = service.status?.loadBalancer?.ingress || []
      const addresses = ingress
        .map((item) => item.ip || item.hostname)
        .filter((item): item is string => Boolean(item))
      return addresses.length > 0 ? addresses : ['<pending>']
    }
    case 'ExternalName':
      return [spec?.externalName || '-']
    case 'NodePort':
    case 'ClusterIP':
      return spec?.externalIPs?.length ? spec.externalIPs : ['-']
    default:
      return ['-']
  }
}

function getServicePortItems(
  ports: NonNullable<Service['spec']>['ports']
): string[] {
  return (ports || []).map((port) => {
    const protocol = port.protocol || 'TCP'
    if (port.nodePort) {
      return `${port.port}:${port.nodePort}/${protocol}`
    }
    return `${port.port}/${protocol}`
  })
}

function CompactStackList({
  items,
  moreLabel,
}: {
  items: string[]
  moreLabel: string
}) {
  const [firstItem, ...hiddenItems] = items

  if (!firstItem) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  if (hiddenItems.length === 0) {
    return (
      <span className="font-mono text-sm text-muted-foreground">
        {firstItem}
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex max-w-[220px] flex-col items-start">
          <span className="max-w-full truncate font-mono text-sm text-muted-foreground">
            {firstItem}
          </span>
          <span className="mt-0.5 text-xs font-medium text-muted-foreground/60">
            + {hiddenItems.length} {moreLabel}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="max-w-[360px] bg-muted px-4 py-3 text-foreground shadow-lg"
      >
        <ul className="space-y-1.5 text-sm leading-relaxed">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex min-w-0 items-start gap-2 font-mono"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
              <span className="min-w-0 break-all">{item}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

export function ServiceListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsService, setLabelsService] = useState<Service | null>(null)
  const [annotationsService, setAnnotationsService] = useState<Service | null>(
    null
  )
  const [deleteServiceTarget, setDeleteServiceTarget] =
    useState<Service | null>(null)
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
          const items = getServiceExternalIPItems(row.original)
          return <CompactStackList items={items} moreLabel={t('common.more')} />
        },
      }),
      serviceColumnHelper.accessor('spec.ports', {
        header: t('services.ports'),
        cell: ({ getValue }) => {
          const items = getServicePortItems(getValue())
          return <CompactStackList items={items} moreLabel={t('common.more')} />
        },
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
      const externalIPs = getServiceExternalIPItems(service).filter(
        (item) => item !== '-' && item !== '<pending>'
      )
      const serviceIPs = externalIPs.length > 0 ? externalIPs : clusterIP ? [clusterIP] : []
      const ports = getServicePortItems(service.spec?.ports)
      const selectorEntries = Object.entries(service.spec?.selector || {})
      const selectorText = selectorEntries
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')

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
          key: 'copy-ip',
          label: t('services.copyIP', 'Copy IP'),
          icon: <Copy className="h-4 w-4" />,
          disabled:
            serviceIPs.length === 0 ||
            serviceIPs.every((item) => item === 'None'),
          onSelect: () => handleCopy(serviceIPs.join(', ')),
        },
        {
          key: 'copy-ports',
          label: t('services.copyPorts', 'Copy ports'),
          icon: <Copy className="h-4 w-4" />,
          disabled: ports.length === 0,
          onSelect: () => handleCopy(ports.join(', ')),
        },
        {
          key: 'copy-selector',
          label: t('services.copySelector', 'Copy selector'),
          icon: <Copy className="h-4 w-4" />,
          disabled: selectorEntries.length === 0,
          onSelect: () => handleCopy(selectorText),
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
        {
          key: 'delete-service',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteServiceTarget(service),
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

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteServiceTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteServiceTarget(null)
          }
        }}
        resourceName={deleteServiceTarget?.metadata?.name || ''}
        resourceType="services"
        namespace={deleteServiceTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
