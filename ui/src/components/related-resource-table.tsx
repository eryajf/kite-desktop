import { useEffect, useMemo, useState } from 'react'
import { IconExternalLink, IconLoader } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { RelatedResources, ResourceType } from '@/types/api'
import { useRelatedResources } from '@/lib/api'
import { getCRDResourcePath, isStandardK8sResource } from '@/lib/k8s'
import { withSubPath } from '@/lib/subpath'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import { Column, SimpleTable } from './simple-table'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

export function RelatedResourcesTable(props: {
  resource: ResourceType
  name: string
  namespace?: string
}) {
  const { resource, name, namespace } = props
  const { t } = useTranslation()

  const { data: relatedResources, isLoading } = useRelatedResources(
    resource,
    name,
    namespace
  )

  const relatedColumns = useMemo(
    (): Column<RelatedResources>[] => [
      {
        header: t('relatedResources.kind'),
        accessor: (rs: RelatedResources) => rs.type,
        align: 'left',
        cell: (value: unknown) => (
          <Badge className="capitalize">{value as string}</Badge>
        ),
      },
      {
        header: t('relatedResources.name'),
        accessor: (rs: RelatedResources) => rs,
        cell: (value: unknown) => {
          const rs = value as RelatedResources
          return <RelatedResourceCell rs={rs} />
        },
      },
      {
        header: t('relatedResources.reason'),
        accessor: (rs: RelatedResources) => rs.reason || '-',
        cell: (value: unknown) => (
          <span className="text-muted-foreground">{value as string}</span>
        ),
      },
    ],
    [t]
  )
  const references = useMemo(
    () =>
      (relatedResources || []).filter(
        (item) => item.direction !== 'referencedBy'
      ),
    [relatedResources]
  )
  const referencedBy = useMemo(
    () =>
      (relatedResources || []).filter(
        (item) => item.direction === 'referencedBy'
      ),
    [relatedResources]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconLoader className="animate-spin mr-2" />
        {t('relatedResources.loading')}
      </div>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('relatedResources.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <RelatedResourcesSection
            title={t('relatedResources.references')}
            description={t('relatedResources.referencesDescription')}
            data={references}
            columns={relatedColumns}
            emptyMessage={t('relatedResources.emptyReferences')}
            tone="reference"
          />
          <RelatedResourcesSection
            title={t('relatedResources.referencedBy')}
            description={t('relatedResources.referencedByDescription')}
            data={referencedBy}
            columns={relatedColumns}
            emptyMessage={t('relatedResources.emptyReferencedBy')}
            tone="referencedBy"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function RelatedResourcesSection({
  title,
  description,
  data,
  columns,
  emptyMessage,
  tone,
}: {
  title: string
  description: string
  data: RelatedResources[]
  columns: Column<RelatedResources>[]
  emptyMessage: string
  tone: 'reference' | 'referencedBy'
}) {
  const toneClassName =
    tone === 'reference'
      ? 'border-sky-200/70 bg-sky-50/50 dark:border-sky-900/60 dark:bg-sky-950/20'
      : 'border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
  const badgeClassName =
    tone === 'reference'
      ? 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300'
      : 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'

  return (
    <section className={`rounded-lg border p-4 ${toneClassName}`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <Badge variant="outline" className={badgeClassName}>
              {data.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="rounded-md border bg-background/80">
        <SimpleTable
          data={data}
          columns={columns}
          emptyMessage={emptyMessage}
        />
      </div>
    </section>
  )
}

function RelatedResourceCell({ rs }: { rs: RelatedResources }) {
  const [open, setOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isIframe = searchParams.get('iframe') === 'true'

  useEffect(() => {
    if (!open) {
      return
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return
      }
      if (event.data?.type === 'kite:related-resource-dialog:escape') {
        setOpen(false)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [open])

  const path = useMemo(() => {
    if (isStandardK8sResource(rs.type)) {
      return `/${rs.type}/${rs.namespace ? `${rs.namespace}/` : ''}${rs.name}`
    }
    if (rs.apiVersion) {
      return getCRDResourcePath(rs.type, rs.apiVersion, rs.namespace, rs.name)
    }
    return undefined
  }, [rs])

  if (!path) {
    return <div className="font-medium text-muted-foreground">{rs.name}</div>
  }

  if (isIframe) {
    return (
      <button
        type="button"
        className="font-medium app-link cursor-pointer"
        onClick={() => navigate(`${path}?iframe=true`)}
      >
        {rs.name}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="font-medium app-link cursor-pointer">{rs.name}</div>
      </DialogTrigger>
      <DialogContent className="!h-[calc(100dvh-1rem)] !max-w-[calc(100vw-1rem)] flex min-h-0 flex-col md:!h-[80%] md:!max-w-[60%]">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle className="capitalize">{rs.type}</DialogTitle>
          <a href={withSubPath(path)} target="_blank" rel="noopener noreferrer">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('relatedResources.openInNewTab')}
            >
              <IconExternalLink size={12} />
            </Button>
          </a>
        </DialogHeader>
        <iframe
          src={`${withSubPath(path)}?iframe=true`}
          className="min-h-0 w-full flex-grow border-none"
        />
      </DialogContent>
    </Dialog>
  )
}
