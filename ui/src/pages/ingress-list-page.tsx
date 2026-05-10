import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Ingress } from 'kubernetes-types/networking/v1'
import { Copy, FileCode2, FileText, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { formatDate } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { Badge } from '@/components/ui/badge'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

export function IngressListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsIngress, setLabelsIngress] = useState<Ingress | null>(null)
  const [annotationsIngress, setAnnotationsIngress] = useState<Ingress | null>(
    null
  )
  const columnHelper = useMemo(() => createColumnHelper<Ingress>(), [])

  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/ingresses/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor('spec.ingressClassName', {
        header: t('ingresses.ingressClass'),
        cell: ({ row }) => row.original.spec?.ingressClassName || t('common.na'),
      }),
      columnHelper.accessor('spec.rules', {
        header: t('ingresses.hosts'),
        cell: ({ row }) => {
          const rules = row.original.spec?.rules || []
          return (
            <Badge variant="outline" className="ml-2 ">
              {rules.length > 0
                ? rules.map((r) => r.host).join(', ')
                : t('common.na')}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('status.loadBalancer.ingress', {
        header: t('ingresses.loadBalancer'),
        cell: ({ row }) => {
          const ingress = row.original.status?.loadBalancer?.ingress || []
          return (
            <div>
              {ingress.length > 0
                ? ingress.map((i) => i.ip || i.hostname).join(', ')
                : t('common.na')}
            </div>
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

  const filter = useCallback((ns: Ingress, query: string) => {
    return ns.metadata!.name!.toLowerCase().includes(query)
  }, [])

  const getIngressDetailPath = useCallback((ingress: Ingress) => {
    return `/ingresses/${ingress.metadata!.namespace}/${ingress.metadata!.name}`
  }, [])

  const handleCopy = useCallback(
    async (value: string) => {
      await copyTextToClipboard(value)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

  const getRowContextMenuItems = useCallback(
    (ingress: Ingress): RowContextMenuItem<Ingress>[] => [
      {
        key: 'view-yaml',
        label: t('common.viewYaml', 'View YAML'),
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => navigate(`${getIngressDetailPath(ingress)}?tab=yaml`),
      },
      { type: 'separator', key: 'primary-actions-separator' },
      {
        key: 'copy-name',
        label: t('common.copyName', 'Copy name'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(ingress.metadata?.name || ''),
      },
      {
        key: 'copy-namespace',
        label: t('common.copyNamespace', 'Copy namespace'),
        icon: <Copy className="h-4 w-4" />,
        onSelect: () => handleCopy(ingress.metadata?.namespace || ''),
      },
      { type: 'separator', key: 'metadata-actions-separator' },
      {
        key: 'manage-labels',
        label: t('common.manageLabels', 'Manage labels'),
        icon: <Tags className="h-4 w-4" />,
        onSelect: () => setLabelsIngress(ingress),
      },
      {
        key: 'manage-annotations',
        label: t('common.manageAnnotations', 'Manage annotations'),
        icon: <FileText className="h-4 w-4" />,
        onSelect: () => setAnnotationsIngress(ingress),
      },
    ],
    [getIngressDetailPath, handleCopy, navigate, t]
  )

  return (
    <>
      <ResourceTable
        resourceName="Ingresses"
        columns={columns}
        searchQueryFilter={filter}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
        getRowContextMenuItems={getRowContextMenuItems}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsIngress)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsIngress(null)
          }
        }}
        resourceType="ingresses"
        resource={labelsIngress}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsIngress)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsIngress(null)
          }
        }}
        resourceType="ingresses"
        resource={annotationsIngress}
        type="annotations"
      />
    </>
  )
}
