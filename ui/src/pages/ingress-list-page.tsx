import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Ingress, IngressBackend } from 'kubernetes-types/networking/v1'
import { FileCode2, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceTable } from '@/components/resource-table'
import { RowContextMenuItem } from '@/components/row-context-menu'

const ingressColumnHelper = createColumnHelper<Ingress>()

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

function getIngressHosts(ingress: Ingress): string[] {
  const hosts = (ingress.spec?.rules || [])
    .map((rule) => rule.host)
    .filter((host): host is string => Boolean(host))

  return hosts.length > 0 ? hosts : ['*']
}

function getIngressLoadBalancerAddresses(ingress: Ingress): string[] {
  const addresses = (ingress.status?.loadBalancer?.ingress || [])
    .map((item) => item.ip || item.hostname)
    .filter((address): address is string => Boolean(address))

  return addresses.length > 0 ? addresses : []
}

function formatBackendServiceName(backend?: IngressBackend) {
  return backend?.service?.name || backend?.resource?.name || '-'
}

function getIngressRouteSummaries(ingress: Ingress): string[] {
  const routes: string[] = []

  for (const rule of ingress.spec?.rules || []) {
    const host = rule.host || '*'
    for (const path of rule.http?.paths || []) {
      routes.push(
        `${host}${path.path || '/'} > ${formatBackendServiceName(path.backend)}`
      )
    }
  }

  return routes
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

function CompactStackList({
  items,
  moreLabel,
  singleLine = false,
}: {
  items: string[]
  moreLabel: string
  singleLine?: boolean
}) {
  const [firstItem, ...hiddenItems] = items

  if (!firstItem) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  if (hiddenItems.length === 0) {
    return (
      <span
        className={
          singleLine
            ? 'block max-w-[320px] truncate font-mono text-sm text-muted-foreground'
            : 'font-mono text-sm text-muted-foreground'
        }
        title={singleLine ? firstItem : undefined}
      >
        {firstItem}
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex max-w-[320px] flex-col items-start">
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
              className={
                singleLine
                  ? 'flex min-w-0 items-center gap-2 font-mono'
                  : 'flex min-w-0 items-start gap-2 font-mono'
              }
            >
              <span
                className={
                  singleLine
                    ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-foreground'
                    : 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground'
                }
              />
              <span
                className={
                  singleLine
                    ? 'min-w-0 max-w-[520px] truncate whitespace-nowrap'
                    : 'min-w-0 break-all'
                }
                title={singleLine ? item : undefined}
              >
                {item}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

export function IngressListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [labelsIngress, setLabelsIngress] = useState<Ingress | null>(null)
  const [annotationsIngress, setAnnotationsIngress] = useState<Ingress | null>(
    null
  )
  const [deleteIngressTarget, setDeleteIngressTarget] =
    useState<Ingress | null>(null)

  const columns = useMemo(
    () => [
      ingressColumnHelper.accessor('metadata.name', {
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
      ingressColumnHelper.accessor('spec.ingressClassName', {
        header: t('ingresses.ingressClass'),
        cell: ({ row }) => row.original.spec?.ingressClassName || t('common.na'),
      }),
      ingressColumnHelper.accessor('spec.rules', {
        header: t('ingresses.hosts'),
        cell: ({ row }) => {
          const items = getIngressHosts(row.original)
          return <CompactStackList items={items} moreLabel={t('common.more')} />
        },
      }),
      ingressColumnHelper.display({
        id: 'rules',
        header: t('ingresses.rules', 'Rules'),
        cell: ({ row }) => {
          const items = getIngressRouteSummaries(row.original)
          return (
            <CompactStackList
              items={items}
              moreLabel={t('common.more')}
              singleLine
            />
          )
        },
      }),
      ingressColumnHelper.accessor('status.loadBalancer.ingress', {
        header: t('ingresses.loadBalancer'),
        cell: ({ row }) => {
          const items = getIngressLoadBalancerAddresses(row.original)
          return <CompactStackList items={items} moreLabel={t('common.more')} />
        },
      }),
      ingressColumnHelper.accessor('metadata.creationTimestamp', {
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

  const filter = useCallback((ingress: Ingress, query: string) => {
    return (
      ingress.metadata!.name!.toLowerCase().includes(query) ||
      (ingress.spec?.ingressClassName?.toLowerCase() || '').includes(query) ||
      getIngressHosts(ingress).some((host) => host.toLowerCase().includes(query)) ||
      getIngressLoadBalancerAddresses(ingress).some((address) =>
        address.toLowerCase().includes(query)
      ) ||
      getIngressRouteSummaries(ingress).some((route) =>
        route.toLowerCase().includes(query)
      ) ||
      includesRecordText(ingress.metadata?.labels, query) ||
      includesRecordText(ingress.metadata?.annotations, query)
    )
  }, [])

  const getIngressDetailPath = useCallback((ingress: Ingress) => {
    return `/ingresses/${ingress.metadata!.namespace}/${ingress.metadata!.name}`
  }, [])

  const getRowContextMenuItems = useCallback(
    (ingress: Ingress): RowContextMenuItem<Ingress>[] => {
      return [
        {
          key: 'edit-config',
          label: t('ingresses.editConfig', 'Edit config'),
          icon: <Pencil className="h-4 w-4" />,
          onSelect: () => navigate(`${getIngressDetailPath(ingress)}?tab=edit`),
        },
        {
          key: 'view-yaml',
          label: t('common.viewYaml', 'View YAML'),
          icon: <FileCode2 className="h-4 w-4" />,
          onSelect: () => navigate(`${getIngressDetailPath(ingress)}?tab=yaml`),
        },
        { type: 'separator', key: 'danger-actions-separator' },
        {
          key: 'delete-ingress',
          label: t('common.delete'),
          icon: <Trash2 className="h-4 w-4" />,
          variant: 'destructive',
          onSelect: () => setDeleteIngressTarget(ingress),
        },
      ]
    },
    [getIngressDetailPath, navigate, t]
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

      <ResourceDeleteConfirmationDialog
        open={Boolean(deleteIngressTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteIngressTarget(null)
          }
        }}
        resourceName={deleteIngressTarget?.metadata?.name || ''}
        resourceType="ingresses"
        namespace={deleteIngressTarget?.metadata?.namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </>
  )
}
