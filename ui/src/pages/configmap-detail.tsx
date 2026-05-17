import { useEffect, useState, type FormEvent } from 'react'
import { IconCopy, IconLoader, IconTrash } from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import { ConfigMap } from 'kubernetes-types/core/v1'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { trackResourceAction } from '@/lib/analytics'
import { updateResource, useResource } from '@/lib/api'
import { copyTextToClipboard } from '@/lib/desktop'
import { getOwnerInfo } from '@/lib/k8s'
import {
  formatDate,
  formatRelativeTimeStrict,
  translateError,
} from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { Textarea } from '@/components/ui/textarea'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { RefreshButton } from '@/components/refresh-button'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { YamlEditor } from '@/components/yaml-editor'

type ConfigMapDataItem = {
  key: string
  value: string
}

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

function toDataItems(data?: Record<string, string>) {
  return Object.entries(data || {}).map(([key, value]) => ({ key, value }))
}

function toDataRecord(items: ConfigMapDataItem[]) {
  return items.reduce<Record<string, string>>((result, item) => {
    const key = item.key.trim()
    if (!key) {
      return result
    }

    result[key] = item.value
    return result
  }, {})
}

function ConfigMapDataTable(props: {
  entries: Record<string, string>
  emptyMessage: string
}) {
  const { entries, emptyMessage } = props
  const { t } = useTranslation()
  const items = Object.entries(entries)

  const copyValue = async (value: string) => {
    await copyTextToClipboard(value)
    toast.success(t('keyValueDataViewer.copiedToClipboard'))
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[minmax(160px,280px)_minmax(0,1fr)_48px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div>{t('detail.fields.key')}</div>
        <div>{t('detail.fields.value')}</div>
        <div className="text-right">{t('common.actions', 'Actions')}</div>
      </div>
      <div className="divide-y">
        {items.map(([key, value]) => (
          <div
            key={key}
            className="grid grid-cols-[minmax(160px,280px)_minmax(0,1fr)_48px] items-start gap-3 px-3 py-2"
          >
            <div className="break-all font-mono text-sm font-medium">{key}</div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed">
              {value}
            </pre>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 justify-self-end"
              aria-label={t('keyValueDataViewer.copyValue')}
              onClick={() => copyValue(value)}
            >
              <IconCopy className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConfigMapDataEditDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  configmap: ConfigMap
  onSave: (data: Record<string, string>) => Promise<boolean>
}) {
  const { configmap, onOpenChange, onSave, open } = props
  const { t } = useTranslation()
  const [items, setItems] = useState<ConfigMapDataItem[]>([])
  const [pendingData, setPendingData] = useState<Record<string, string> | null>(
    null
  )
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setItems(toDataItems(configmap.data))
    setPendingData(null)
    setIsConfirmOpen(false)
    setIsSaving(false)
  }, [configmap.data, open])

  const handleItemChange = (
    index: number,
    field: keyof ConfigMapDataItem,
    value: string
  ) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPendingData(toDataRecord(items))
    setIsConfirmOpen(true)
  }

  const handleConfirmSave = async () => {
    if (!pendingData) {
      return
    }

    setIsSaving(true)

    try {
      const saved = await onSave(pendingData)
      if (saved) {
        setIsConfirmOpen(false)
        setPendingData(null)
        onOpenChange(false)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[85vh] max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('configMaps.editDataTitle')}</DialogTitle>
            <DialogDescription>
              {t('configMaps.editDataDescription')}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            onSubmit={handleSubmit}
          >
            <div className="flex items-center justify-between gap-3 pb-4">
              <Label>{t('detail.tabs.data')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((current) => [{ key: '', value: '' }, ...current])
                }
              >
                <Plus className="h-4 w-4" />
                {t('common.add', 'Add')}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('detail.empty.noDataEntries')}
                </p>
              ) : null}

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={`configmap-data-${index}`}
                    className="grid grid-cols-[minmax(160px,240px)_minmax(0,1fr)_auto] gap-2 rounded-md border p-3"
                  >
                    <Input
                      value={item.key}
                      onChange={(event) =>
                        handleItemChange(index, 'key', event.target.value)
                      }
                      placeholder={t('common.key', 'Key')}
                    />
                    <Textarea
                      value={item.value}
                      onChange={(event) =>
                        handleItemChange(index, 'value', event.target.value)
                      }
                      placeholder={t('common.value', 'Value')}
                      className="min-h-20 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.remove', 'Remove')}
                      onClick={() =>
                        setItems((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('configMaps.confirmSaveDataTitle')}</DialogTitle>
            <DialogDescription>
              {t('configMaps.confirmSaveDataDescription', {
                count: Object.keys(pendingData || {}).length,
              })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSave}
              disabled={isSaving}
            >
              {isSaving
                ? t('common.saving', 'Saving...')
                : t('configMaps.confirmSaveData')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ConfigMapDetail(props: { namespace: string; name: string }) {
  const { namespace, name } = props
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDataEditDialogOpen, setIsDataEditDialogOpen] = useState(false)

  const { t } = useTranslation()

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: handleRefresh,
  } = useResource('configmaps', name, namespace)

  useEffect(() => {
    if (data) {
      setYamlContent(yaml.dump(data, { indent: 2 }))
    }
  }, [data])

  const handleSaveYaml = async (content: ConfigMap) => {
    setIsSavingYaml(true)
    try {
      await updateResource('configmaps', name, namespace, content)
      trackResourceAction('configmaps', 'yaml_save', {
        result: 'success',
      })
      toast.success(t('detail.status.yamlSaved'))
      await handleRefresh()
      return true
    } catch (error) {
      trackResourceAction('configmaps', 'yaml_save', {
        result: 'error',
      })
      toast.error(translateError(error, t))
      return false
    } finally {
      setIsSavingYaml(false)
    }
  }

  const handleSaveData = async (nextData: Record<string, string>) => {
    if (!data) {
      return false
    }

    try {
      await updateResource('configmaps', name, namespace, {
        ...(data as ConfigMap),
        data: nextData,
      })
      trackResourceAction('configmaps', 'data_form_save', {
        result: 'success',
      })
      toast.success(t('configMaps.dataSaved'))
      await handleRefresh()
      return true
    } catch (error) {
      trackResourceAction('configmaps', 'data_form_save', {
        result: 'error',
      })
      toast.error(translateError(error, t))
      return false
    }
  }

  const handleManualRefresh = async () => {
    trackResourceAction('configmaps', 'refresh')
    setRefreshKey((prev) => prev + 1)
    await handleRefresh()
  }

  if (isLoading)
    return (
      <div className="flex items-center justify-center p-8">
        <IconLoader className="h-6 w-6 animate-spin" />
      </div>
    )

  if (isError) {
    return (
      <ErrorMessage
        error={error}
        resourceName="ConfigMap"
        refetch={handleRefresh}
      />
    )
  }

  if (!data) {
    return <div>{t('detail.sections.configMapInformation')}</div>
  }

  const configmap = data as ConfigMap
  const ownerInfo = getOwnerInfo(configmap.metadata)
  const dataCount = Object.keys(configmap.data || {}).length
  const binaryDataCount = Object.keys(configmap.binaryData || {}).length
  const totalCount = dataCount + binaryDataCount
  const labelCount = Object.keys(configmap.metadata?.labels || {}).length
  const annotationCount = Object.keys(
    configmap.metadata?.annotations || {}
  ).length

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{configmap.metadata!.name}</h1>
          <p className="text-muted-foreground">
            {t('detail.fields.namespace')}:{' '}
            <span className="font-medium">{configmap.metadata!.namespace}</span>
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
            resourceType="configmaps"
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
                    <CardTitle>
                      {t('detail.sections.configMapInformation')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.name')}
                        </Label>
                        <p className="break-all text-sm font-medium">
                          {configmap.metadata!.name}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.namespace')}
                        </Label>
                        <p className="text-sm font-medium">
                          {configmap.metadata!.namespace}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.created')}
                        </Label>
                        <p className="text-sm">
                          {formatTimestampWithRelative(
                            configmap.metadata!.creationTimestamp
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.keys')}
                        </Label>
                        <p className="text-sm">{totalCount}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.labels')}
                        </Label>
                        <p className="text-sm">{labelCount}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.annotations')}
                        </Label>
                        <p className="text-sm">{annotationCount}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.binaryData')}
                        </Label>
                        <p className="text-sm">{binaryDataCount}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.uid')}
                        </Label>
                        <p className="text-sm font-mono">
                          {configmap.metadata!.uid}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.resourceVersion')}
                        </Label>
                        <p className="text-sm font-mono">
                          {configmap.metadata!.resourceVersion}
                        </p>
                      </div>
                      {ownerInfo && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            {t('detail.fields.owner')}
                          </Label>
                          <p className="text-sm">
                            <Link
                              to={ownerInfo.path}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {ownerInfo.kind}/{ownerInfo.name}
                            </Link>
                          </p>
                        </div>
                      )}
                    </div>
                    <LabelsAnno
                      labels={configmap.metadata!.labels || {}}
                      annotations={configmap.metadata!.annotations || {}}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {t('detail.tabs.data')}
                      {dataCount > 0 && (
                        <Badge variant="secondary">{dataCount}</Badge>
                      )}
                    </CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsDataEditDialogOpen(true)}
                    >
                      <Pencil className="h-4 w-4" />
                      {t('common.edit')}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ConfigMapDataTable
                      entries={configmap.data || {}}
                      emptyMessage={t('detail.empty.noDataEntries')}
                    />
                  </CardContent>
                </Card>

                {binaryDataCount > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {t('detail.fields.binaryData')}
                        <Badge variant="secondary">{binaryDataCount}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ConfigMapDataTable
                        entries={Object.fromEntries(
                          Object.entries(configmap.binaryData!).map(
                            ([key, value]) => [key, value as unknown as string]
                          )
                        )}
                        emptyMessage={t('detail.empty.noBinaryDataEntries')}
                      />
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
              <div className="space-y-4">
                <YamlEditor<'configmaps'>
                  key={refreshKey}
                  value={yamlContent}
                  title={t('yamlEditor.title')}
                  onChange={(c) => setYamlContent(c)}
                  onSave={handleSaveYaml}
                  isSaving={isSavingYaml}
                />
              </div>
            ),
          },
          {
            value: 'related',
            label: t('detail.tabs.related'),
            content: (
              <RelatedResourcesTable
                resource="configmaps"
                name={configmap.metadata!.name!}
                namespace={configmap.metadata!.namespace}
              />
            ),
          },
          {
            value: 'events',
            label: t('detail.tabs.events'),
            content: (
              <EventTable
                resource="configmaps"
                name={configmap.metadata!.name!}
                namespace={configmap.metadata!.namespace}
              />
            ),
          },
          {
            value: 'history',
            label: t('detail.tabs.history'),
            content: (
              <ResourceHistoryTable
                resourceType="configmaps"
                name={name}
                namespace={namespace}
                currentResource={configmap}
              />
            ),
          },
        ]}
      />

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={configmap.metadata!.name!}
        resourceType="configmaps"
        namespace={namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />

      <ConfigMapDataEditDialog
        open={isDataEditDialogOpen}
        onOpenChange={setIsDataEditDialogOpen}
        configmap={configmap}
        onSave={handleSaveData}
      />
    </div>
  )
}
