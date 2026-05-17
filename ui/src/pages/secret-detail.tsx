import { useEffect, useState, type FormEvent } from 'react'
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconLoader,
  IconTrash,
} from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import { Secret } from 'kubernetes-types/core/v1'
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
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { RefreshButton } from '@/components/refresh-button'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { YamlEditor } from '@/components/yaml-editor'

type SecretDataItem = {
  key: string
  value: string
}

function decodeBase64Value(value: string) {
  try {
    return atob(value)
  } catch {
    return value
  }
}

function encodeBase64Value(value: string) {
  return btoa(value)
}

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

function toDecodedDataItems(data?: Record<string, string>) {
  return Object.entries(data || {}).map(([key, value]) => ({
    key,
    value: decodeBase64Value(value),
  }))
}

function toEncodedDataRecord(items: SecretDataItem[]) {
  return items.reduce<Record<string, string>>((result, item) => {
    const key = item.key.trim()
    if (!key) {
      return result
    }

    result[key] = encodeBase64Value(item.value)
    return result
  }, {})
}

function SecretDataTable(props: {
  entries: Record<string, string>
  emptyMessage: string
  revealAll: boolean
}) {
  const { entries, emptyMessage, revealAll } = props
  const { t } = useTranslation()
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const items = Object.entries(entries)

  useEffect(() => {
    setRevealedKeys(revealAll ? new Set(Object.keys(entries)) : new Set())
  }, [entries, revealAll])

  const copyValue = async (value: string) => {
    await copyTextToClipboard(value)
    toast.success(t('keyValueDataViewer.copiedToClipboard'))
  }

  const toggleKey = (key: string) => {
    setRevealedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[minmax(160px,280px)_minmax(0,1fr)_88px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div>{t('detail.fields.key')}</div>
        <div>{t('detail.fields.value')}</div>
        <div className="text-right">{t('common.actions', 'Actions')}</div>
      </div>
      <div className="divide-y">
        {items.map(([key, rawValue]) => {
          const value = decodeBase64Value(rawValue)
          const revealed = revealedKeys.has(key)

          return (
            <div
              key={key}
              className="grid grid-cols-[minmax(160px,280px)_minmax(0,1fr)_88px] items-start gap-3 px-3 py-2"
            >
              <div className="break-all font-mono text-sm font-medium">
                {key}
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed">
                <span className={revealed ? '' : 'blur-sm select-none inline'}>
                  {value}
                </span>
              </pre>
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={
                    revealed
                      ? t('keyValueDataViewer.hide')
                      : t('keyValueDataViewer.reveal')
                  }
                  onClick={() => toggleKey(key)}
                >
                  {revealed ? (
                    <IconEyeOff className="h-4 w-4" />
                  ) : (
                    <IconEye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('keyValueDataViewer.copyValue')}
                  onClick={() => copyValue(value)}
                >
                  <IconCopy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SecretDataEditDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  secret: Secret
  onSave: (data: Record<string, string>) => Promise<boolean>
}) {
  const { onOpenChange, onSave, open, secret } = props
  const { t } = useTranslation()
  const [items, setItems] = useState<SecretDataItem[]>([])
  const [pendingData, setPendingData] = useState<Record<string, string> | null>(
    null
  )
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setItems(toDecodedDataItems(secret.data))
    setPendingData(null)
    setIsConfirmOpen(false)
    setIsSaving(false)
  }, [open, secret.data])

  const handleItemChange = (
    index: number,
    field: keyof SecretDataItem,
    value: string
  ) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPendingData(toEncodedDataRecord(items))
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
            <DialogTitle>{t('secrets.editDataTitle')}</DialogTitle>
            <DialogDescription>
              {t('secrets.editDataDescription')}
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
                    key={`secret-data-${index}`}
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
            <DialogTitle>{t('secrets.confirmSaveDataTitle')}</DialogTitle>
            <DialogDescription>
              {t('secrets.confirmSaveDataDescription', {
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
                : t('secrets.confirmSaveData')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function SecretDetail(props: { namespace: string; name: string }) {
  const { namespace, name } = props
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDataEditDialogOpen, setIsDataEditDialogOpen] = useState(false)
  const [isAllDataRevealed, setIsAllDataRevealed] = useState(false)
  const [showDecodedYaml, setShowDecodedYaml] = useState(false)

  const { t } = useTranslation()

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: handleRefresh,
  } = useResource('secrets', name, namespace)

  useEffect(() => {
    if (data) {
      setYamlContent(yaml.dump(data, { indent: 2 }))
    }
  }, [data])

  const handleSaveYaml = async (content: Secret) => {
    setIsSavingYaml(true)
    try {
      await updateResource('secrets', name, namespace, content)
      trackResourceAction('secrets', 'yaml_save', {
        result: 'success',
      })
      toast.success(t('detail.status.yamlSaved'))
      await handleRefresh()
      return true
    } catch (error) {
      trackResourceAction('secrets', 'yaml_save', {
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

  const handleSaveData = async (nextData: Record<string, string>) => {
    if (!data) {
      return false
    }

    try {
      await updateResource('secrets', name, namespace, {
        ...(data as Secret),
        data: nextData,
        stringData: undefined,
      })
      trackResourceAction('secrets', 'data_form_save', {
        result: 'success',
      })
      toast.success(t('secrets.dataSaved'))
      await handleRefresh()
      return true
    } catch (error) {
      trackResourceAction('secrets', 'data_form_save', {
        result: 'error',
      })
      toast.error(translateError(error, t))
      return false
    }
  }

  const handleManualRefresh = async () => {
    trackResourceAction('secrets', 'refresh')
    setRefreshKey((prev) => prev + 1)
    await handleRefresh()
  }

  const getDecodedYamlContent = () => {
    if (!data) return yamlContent

    const showSecret = { ...data } as Secret
    if (showDecodedYaml) {
      if (showSecret.data) {
        const decodedData: Record<string, string> = {}
        Object.entries(showSecret.data).forEach(([key, value]) => {
          decodedData[key] = atob(value)
        })
        showSecret.stringData = decodedData
        showSecret.data = undefined
      }
    } else {
      if (showSecret.stringData) {
        const data: Record<string, string> = {}
        Object.entries(showSecret.stringData).forEach(([key, value]) => {
          data[key] = btoa(value)
        })
        showSecret.data = data
        showSecret.stringData = undefined
      }
    }
    return yaml.dump(showSecret, { indent: 2 })
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
        resourceName="Secret"
        refetch={handleRefresh}
      />
    )
  }

  if (!data) {
    return <div>{t('detail.sections.secretInformation')}</div>
  }

  const secret = data as Secret
  const ownerInfo = getOwnerInfo(secret.metadata)
  const isOwnedBy = ownerInfo !== null
  const owner = ownerInfo
  const dataCount = Object.keys(secret.data || {}).length
  const labelCount = Object.keys(secret.metadata?.labels || {}).length
  const annotationCount = Object.keys(secret.metadata?.annotations || {}).length
  const dataSize = Object.values(secret.data || {}).reduce(
    (total, value) => total + value.length,
    0
  )

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{secret.metadata!.name}</h1>
          <p className="text-muted-foreground">
            {t('detail.fields.namespace')}:{' '}
            <span className="font-medium">{secret.metadata!.namespace}</span>
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
                {/* Secret Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('detail.sections.secretInformation')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.name')}
                        </Label>
                        <p className="break-all text-sm font-medium">
                          {secret.metadata!.name}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.namespace')}
                        </Label>
                        <p className="text-sm font-medium">
                          {secret.metadata!.namespace}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.created')}
                        </Label>
                        <p className="text-sm">
                          {formatTimestampWithRelative(
                            secret.metadata!.creationTimestamp
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.type')}
                        </Label>
                        <p className="text-sm">
                          <Badge variant="outline">
                            {secret.type || 'Opaque'}
                          </Badge>
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.keys')}
                        </Label>
                        <p className="text-sm">{dataCount}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.size')}
                        </Label>
                        <p className="text-sm">
                          {dataSize} {t('detail.fields.bytes')}
                        </p>
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
                          {t('detail.fields.uid')}
                        </Label>
                        <p className="text-sm font-mono">
                          {secret.metadata!.uid}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.resourceVersion')}
                        </Label>
                        <p className="text-sm font-mono">
                          {secret.metadata!.resourceVersion}
                        </p>
                      </div>
                      {isOwnedBy && owner && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            {t('detail.fields.owner')}
                          </Label>
                          <p className="text-sm">
                            <Link to={owner.path} className="app-link">
                              {owner.kind}/{owner.name}
                            </Link>
                          </p>
                        </div>
                      )}
                    </div>
                    <LabelsAnno
                      labels={secret.metadata!.labels || {}}
                      annotations={secret.metadata!.annotations || {}}
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
                    <div className="flex flex-wrap gap-2">
                      {dataCount > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setIsAllDataRevealed((current) => !current)
                          }
                        >
                          {isAllDataRevealed ? (
                            <IconEyeOff className="h-4 w-4" />
                          ) : (
                            <IconEye className="h-4 w-4" />
                          )}
                          {isAllDataRevealed
                            ? t('keyValueDataViewer.hideAll')
                            : t('keyValueDataViewer.revealAll')}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsDataEditDialogOpen(true)}
                      >
                        <Pencil className="h-4 w-4" />
                        {t('common.edit')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <SecretDataTable
                      entries={secret.data || {}}
                      emptyMessage={t('detail.empty.noDataEntries')}
                      revealAll={isAllDataRevealed}
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
                <div className="flex items-center justify-between">
                  {secret.data && Object.keys(secret.data).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDecodedYaml(!showDecodedYaml)}
                    >
                      {showDecodedYaml
                        ? t('detail.buttons.showBase64')
                        : t('detail.buttons.decodeValues')}
                    </Button>
                  )}
                </div>
                <YamlEditor<'secrets'>
                  key={`${refreshKey}-${showDecodedYaml}`}
                  value={getDecodedYamlContent()}
                  title={t('yamlEditor.title')}
                  onChange={handleYamlChange}
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
                resource="secrets"
                name={secret.metadata!.name!}
                namespace={secret.metadata!.namespace}
              />
            ),
          },
          {
            value: 'events',
            label: t('detail.tabs.events'),
            content: (
              <EventTable
                resource="secrets"
                name={secret.metadata!.name!}
                namespace={secret.metadata!.namespace}
              />
            ),
          },
          {
            value: 'history',
            label: t('detail.tabs.history'),
            content: (
              <ResourceHistoryTable
                resourceType="secrets"
                name={name}
                namespace={namespace}
                currentResource={secret}
              />
            ),
          },
        ]}
      />

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={secret.metadata!.name!}
        resourceType="secrets"
        namespace={namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />

      <SecretDataEditDialog
        open={isDataEditDialogOpen}
        onOpenChange={setIsDataEditDialogOpen}
        secret={secret}
        onSave={handleSaveData}
      />
    </div>
  )
}
