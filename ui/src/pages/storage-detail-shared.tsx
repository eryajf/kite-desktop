import { ReactNode, useEffect, useState } from 'react'
import { IconLoader, IconTrash } from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ResourceType, ResourceTypeMap } from '@/types/api'
import { trackResourceAction } from '@/lib/analytics'
import { updateResource, useResource } from '@/lib/api'
import { translateError } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { RefreshButton } from '@/components/refresh-button'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { YamlEditor } from '@/components/yaml-editor'

export function DetailField(props: {
  label: ReactNode
  children: ReactNode
  mono?: boolean
}) {
  const { children, label, mono = false } = props

  return (
    <div className="min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className={mono ? 'mt-1 truncate font-mono text-sm' : 'mt-1 text-sm'}>
        {children || '-'}
      </div>
    </div>
  )
}

export function StatusBadge({ phase }: { phase?: string }) {
  const value = phase || 'Unknown'
  const variant =
    value === 'Bound'
      ? 'default'
      : value === 'Lost' || value === 'Failed' || value === 'Released'
        ? 'destructive'
        : 'secondary'

  return <Badge variant={variant}>{value}</Badge>
}

export function KeyValueList({ values }: { values?: Record<string, string> }) {
  const entries = Object.entries(values || {})

  if (entries.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="break-all font-mono text-sm">
          {key}={value}
        </div>
      ))}
    </div>
  )
}

export function EmptyTableRow({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation()

  return (
    <tr className="border-b transition-colors">
      <td colSpan={colSpan} className="h-16 p-2 text-center text-sm text-muted-foreground">
        {t('common.noData', 'No data')}
      </td>
    </tr>
  )
}

export function StorageResourceDetailShell<T extends ResourceType>(props: {
  resourceType: T
  name: string
  namespace?: string
  title: string
  overviewTitle: string
  renderOverview: (resource: ResourceTypeMap[T]) => ReactNode
  renderAssociations?: (resource: ResourceTypeMap[T]) => ReactNode
  renderHeaderActions?: (
    resource: ResourceTypeMap[T],
    refresh: () => Promise<void>
  ) => ReactNode
}) {
  const {
    name,
    namespace,
    overviewTitle,
    renderAssociations,
    renderHeaderActions,
    renderOverview,
    resourceType,
    title,
  } = props
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
  } = useResource(resourceType, name, namespace)

  useEffect(() => {
    if (data) {
      setYamlContent(yaml.dump(data, { indent: 2 }))
    }
  }, [data])

  const handleSaveYaml = async (content: ResourceTypeMap[T]) => {
    setIsSavingYaml(true)
    try {
      await updateResource(resourceType, name, namespace, content)
      trackResourceAction(resourceType, 'yaml_save', { result: 'success' })
      toast.success('YAML saved successfully')
      await handleRefresh()
      return true
    } catch (error) {
      trackResourceAction(resourceType, 'yaml_save', { result: 'error' })
      toast.error(translateError(error, t))
      return false
    } finally {
      setIsSavingYaml(false)
    }
  }

  const handleManualRefresh = async () => {
    trackResourceAction(resourceType, 'refresh')
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
              <span>{t('detail.status.loading', { resource: title })}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <ErrorMessage
        resourceName={title}
        error={error}
        refetch={handleManualRefresh}
      />
    )
  }

  const resource = data as ResourceTypeMap[T]

  return (
    <div className="space-y-2">
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
          <RefreshButton variant="outline" size="sm" onClick={handleManualRefresh}>
            {t('detail.buttons.refresh')}
          </RefreshButton>
          <DescribeDialog resourceType={resourceType} namespace={namespace} name={name} />
          {renderHeaderActions ? renderHeaderActions(resource, handleManualRefresh) : null}
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
                    <CardTitle>{overviewTitle}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {renderOverview(resource)}
                    {renderAssociations ? renderAssociations(resource) : null}
                    <LabelsAnno
                      labels={resource.metadata?.labels || {}}
                      annotations={resource.metadata?.annotations || {}}
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
              <YamlEditor
                key={refreshKey}
                value={yamlContent}
                title={t('yamlEditor.title')}
                onSave={handleSaveYaml}
                onChange={setYamlContent}
                isSaving={isSavingYaml}
              />
            ),
          },
          {
            value: 'Related',
            label: t('detail.tabs.related'),
            content: (
              <RelatedResourcesTable
                resource={resourceType}
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
                resource={resourceType}
                namespace={namespace}
                name={name}
              />
            ),
          },
          {
            value: 'history',
            label: t('detail.tabs.history'),
            content: (
              <ResourceHistoryTable
                resourceType={resourceType}
                name={name}
                namespace={namespace}
                currentResource={resource}
              />
            ),
          },
        ]}
      />

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={name}
        resourceType={resourceType}
        namespace={namespace}
      />
    </div>
  )
}
