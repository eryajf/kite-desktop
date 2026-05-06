import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Service } from 'kubernetes-types/core/v1'
import { Copy, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { getServiceExternalIP } from '@/lib/k8s'
import { formatDate } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

export function ServiceListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsService, setLabelsService] = useState<Service | null>(null)
  const [annotationsService, setAnnotationsService] = useState<Service | null>(
    null
  )
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Service>()

  // Define columns for the service table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
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
      columnHelper.accessor('spec.type', {
        header: t('services.type'),
        enableColumnFilter: true,
        cell: ({ getValue }) => {
          const type = getValue() || 'ClusterIP'
          return <Badge variant="outline">{type}</Badge>
        },
      }),
      columnHelper.accessor('spec.clusterIP', {
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
      columnHelper.accessor('status.loadBalancer.ingress', {
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
      columnHelper.accessor('spec.ports', {
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
      columnHelper.accessor('metadata.creationTimestamp', {
        header: t('common.created'),
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '')

          return (
            <span className="text-muted-foreground text-sm">{dateStr}</span>
          )
        },
      }),
    ],
    [columnHelper, t]
  )

  // Custom filter for service search
  const serviceSearchFilter = useCallback((service: Service, query: string) => {
    return (
      service.metadata!.name!.toLowerCase().includes(query) ||
      (service.spec!.type?.toLowerCase() || '').includes(query) ||
      (service.spec!.clusterIP?.toLowerCase() || '').includes(query)
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
