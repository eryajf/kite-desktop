import { useEffect, useState } from 'react'
import {
  IconBan,
  IconCircleCheckFilled,
  IconDroplet,
  IconExclamationCircle,
  IconLoader,
  IconLock,
  IconRefresh,
  IconReload,
} from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import { Node } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  cordonNode,
  drainNode,
  taintNode,
  uncordonNode,
  untaintNode,
  updateResource,
  useResource,
  useResources,
} from '@/lib/api'
import {
  enrichNodeConditionsWithHealth,
  formatCPU,
  formatDate,
  formatMemory,
  translateError,
} from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { NodeMonitoring } from '@/components/node-monitoring'
import { PodTable } from '@/components/pod-table'
import { Terminal } from '@/components/terminal'
import { YamlEditor } from '@/components/yaml-editor'

export function NodeDetail(props: { name: string }) {
  const { name } = props
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { t } = useTranslation()

  // Node operation states
  const [isDrainPopoverOpen, setIsDrainPopoverOpen] = useState(false)
  const [isCordonPopoverOpen, setIsCordonPopoverOpen] = useState(false)
  const [isTaintPopoverOpen, setIsTaintPopoverOpen] = useState(false)

  // Drain operation options
  const [drainOptions, setDrainOptions] = useState({
    force: false,
    gracePeriod: 30,
    deleteLocalData: false,
    ignoreDaemonsets: true,
  })

  // Taint operation data
  const [taintData, setTaintData] = useState({
    key: '',
    value: '',
    effect: 'NoSchedule' as 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute',
  })

  // Untaint key
  const [untaintKey, setUntaintKey] = useState('')

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: handleRefresh,
  } = useResource('nodes', name)

  useEffect(() => {
    if (data) {
      setYamlContent(yaml.dump(data, { indent: 2 }))
    }
  }, [data])

  const {
    data: relatedPods,
    isLoading: isLoadingRelated,
    refetch: refetchRelated,
  } = useResources('pods', undefined, {
    fieldSelector: `spec.nodeName=${name}`,
  })

  const handleSaveYaml = async (content: Node) => {
    setIsSavingYaml(true)
    try {
      await updateResource('nodes', name, undefined, content)
      toast.success('YAML saved successfully')
    } catch (error) {
      console.error('Failed to save YAML:', error)
      toast.error(translateError(error, t))
    } finally {
      setIsSavingYaml(false)
    }
  }

  // Node operation handlers
  const handleDrain = async () => {
    try {
      await drainNode(name, drainOptions)
      toast.success(`Node ${name} drained successfully`)
      setIsDrainPopoverOpen(false)
      handleRefresh()
    } catch (error) {
      console.error('Failed to drain node:', error)
      toast.error(translateError(error, t))
    }
  }

  const handleCordon = async () => {
    try {
      await cordonNode(name)
      toast.success(`Node ${name} cordoned successfully`)
      setIsCordonPopoverOpen(false)
      handleRefresh()
    } catch (error) {
      console.error('Failed to cordon node:', error)
      toast.error(translateError(error, t))
    }
  }

  const handleUncordon = async () => {
    try {
      await uncordonNode(name)
      toast.success(`Node ${name} uncordoned successfully`)
      setIsCordonPopoverOpen(false)
      handleRefresh()
    } catch (error) {
      console.error('Failed to uncordon node:', error)
      toast.error(translateError(error, t))
    }
  }

  const handleTaint = async () => {
    if (!taintData.key.trim()) {
      toast.error('Taint key is required')
      return
    }

    try {
      await taintNode(name, taintData)
      toast.success(`Node ${name} tainted successfully`)
      setIsTaintPopoverOpen(false)
      setTaintData({ key: '', value: '', effect: 'NoSchedule' })
      handleRefresh()
    } catch (error) {
      console.error('Failed to taint node:', error)
      toast.error(translateError(error, t))
    }
  }

  const handleUntaint = async (key?: string) => {
    const taintKey = key || untaintKey
    if (!taintKey.trim()) {
      toast.error('Taint key is required')
      return
    }

    try {
      await untaintNode(name, taintKey)
      toast.success(`Taint removed from node ${name} successfully`)
      if (!key) setUntaintKey('')
      handleRefresh()
    } catch (error) {
      console.error('Failed to remove taint:', error)
      toast.error(translateError(error, t))
    }
  }

  const handleYamlChange = (content: string) => {
    setYamlContent(content)
  }

  const handleManualRefresh = async () => {
    setRefreshKey((prev) => prev + 1)
    await handleRefresh()
    await refetchRelated()
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
                  resource: t('resourceKind.node'),
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
      <ErrorMessage resourceName="Node" error={error} refetch={handleRefresh} />
    )
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{name}</h1>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
          <Button
            disabled={isLoading}
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
          >
            <IconRefresh className="w-4 h-4" />
            {t('detail.buttons.refresh')}
          </Button>
          <DescribeDialog resourceType="nodes" name={name} />
          {/* Drain Node Popover */}
          <Popover
            open={isDrainPopoverOpen}
            onOpenChange={setIsDrainPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <IconDroplet className="w-4 h-4" />
                {t('detail.buttons.drain')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium">
                    {t('detail.dialogs.drainNode.title')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('detail.dialogs.drainNode.description')}
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="force"
                      checked={drainOptions.force}
                      onChange={(e) =>
                        setDrainOptions({
                          ...drainOptions,
                          force: e.target.checked,
                        })
                      }
                    />
                    <Label htmlFor="force" className="text-sm">
                      {t('detail.dialogs.drainNode.forceDrain')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="deleteLocalData"
                      checked={drainOptions.deleteLocalData}
                      onChange={(e) =>
                        setDrainOptions({
                          ...drainOptions,
                          deleteLocalData: e.target.checked,
                        })
                      }
                    />
                    <Label htmlFor="deleteLocalData" className="text-sm">
                      {t('detail.dialogs.drainNode.deleteLocalData')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="ignoreDaemonsets"
                      checked={drainOptions.ignoreDaemonsets}
                      onChange={(e) =>
                        setDrainOptions({
                          ...drainOptions,
                          ignoreDaemonsets: e.target.checked,
                        })
                      }
                    />
                    <Label htmlFor="ignoreDaemonsets" className="text-sm">
                      {t('detail.dialogs.drainNode.ignoreDaemonSets')}
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gracePeriod" className="text-sm">
                      {t('detail.dialogs.drainNode.gracePeriod')}
                    </Label>
                    <Input
                      id="gracePeriod"
                      type="number"
                      value={drainOptions.gracePeriod}
                      onChange={(e) =>
                        setDrainOptions({
                          ...drainOptions,
                          gracePeriod: parseInt(e.target.value) || 30,
                        })
                      }
                      min={0}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleDrain} size="sm" variant="destructive">
                    {t('detail.dialogs.drainNode.drainButton')}
                  </Button>
                  <Button
                    onClick={() => setIsDrainPopoverOpen(false)}
                    size="sm"
                    variant="outline"
                  >
                    {t('detail.buttons.cancel')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Cordon/Uncordon Toggle */}
          {data.spec?.unschedulable ? (
            <Button onClick={handleUncordon} variant="outline" size="sm">
              <IconReload className="w-4 h-4" />
              {t('detail.buttons.uncordon')}
            </Button>
          ) : (
            <Popover
              open={isCordonPopoverOpen}
              onOpenChange={setIsCordonPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <IconBan className="w-4 h-4" />
                  {t('detail.buttons.cordon')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium">
                      {t('detail.dialogs.cordonNode.title')}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t('detail.dialogs.cordonNode.description')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCordon}
                      size="sm"
                      variant="destructive"
                    >
                      {t('detail.dialogs.cordonNode.cordonButton')}
                    </Button>
                    <Button
                      onClick={() => setIsCordonPopoverOpen(false)}
                      size="sm"
                      variant="outline"
                    >
                      {t('detail.buttons.cancel')}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Taint Node Popover */}
          <Popover
            open={isTaintPopoverOpen}
            onOpenChange={setIsTaintPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLock className="w-4 h-4" />
                {t('detail.buttons.taint')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium">
                    {t('detail.dialogs.taintNode.title')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('detail.dialogs.taintNode.description')}
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="taintKey" className="text-sm">
                      {t('detail.dialogs.taintNode.key')}
                    </Label>
                    <Input
                      id="taintKey"
                      value={taintData.key}
                      onChange={(e) =>
                        setTaintData({ ...taintData, key: e.target.value })
                      }
                      placeholder={t('detail.dialogs.taintNode.keyPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taintValue" className="text-sm">
                      {t('detail.dialogs.taintNode.value')}
                    </Label>
                    <Input
                      id="taintValue"
                      value={taintData.value}
                      onChange={(e) =>
                        setTaintData({ ...taintData, value: e.target.value })
                      }
                      placeholder={t('detail.dialogs.taintNode.valuePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taintEffect" className="text-sm">
                      {t('detail.dialogs.taintNode.effect')}
                    </Label>
                    <Select
                      value={taintData.effect}
                      onValueChange={(
                        value: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute'
                      ) => setTaintData({ ...taintData, effect: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NoSchedule">NoSchedule</SelectItem>
                        <SelectItem value="PreferNoSchedule">
                          PreferNoSchedule
                        </SelectItem>
                        <SelectItem value="NoExecute">NoExecute</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleTaint} size="sm" variant="destructive">
                    {t('detail.dialogs.taintNode.addTaintButton')}
                  </Button>
                  <Button
                    onClick={() => setIsTaintPopoverOpen(false)}
                    size="sm"
                    variant="outline"
                  >
                    {t('detail.buttons.cancel')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <ResponsiveTabs
        tabs={[
          {
            value: 'overview',
            label: t('detail.tabs.overview'),
            content: (
              <div className="space-y-6">
                {/* Status Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('detail.sections.statusOverview')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {data.status?.conditions?.find(
                            (c) => c.type === 'Ready' && c.status === 'True'
                          ) ? (
                            <IconCircleCheckFilled className="w-4 h-4 fill-green-500" />
                          ) : (
                            <IconExclamationCircle className="w-4 h-4 fill-red-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {t('common.status')}
                          </p>
                          <p className="text-sm font-medium">
                            {data.status?.conditions?.find(
                              (c) => c.type === 'Ready' && c.status === 'True'
                            )
                              ? t('detail.fields.ready')
                              : t('detail.fields.notReady')}
                            {data.spec?.unschedulable
                              ? ` ${t('detail.fields.schedulingDisabled')}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t('detail.fields.role')}
                        </p>
                        <p className="text-sm">
                          {Object.keys(data.metadata?.labels || {})
                            .find((key) =>
                              key.startsWith('node-role.kubernetes.io/')
                            )
                            ?.replace('node-role.kubernetes.io/', '') ||
                            t('detail.fields.na')}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t('detail.fields.internalIP')}
                        </p>
                        <p className="text-sm font-medium font-mono">
                          {data.status?.addresses?.find(
                            (addr) => addr.type === 'InternalIP'
                          )?.address || t('detail.fields.na')}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t('detail.fields.podCIDR')}
                        </p>
                        <p className="text-sm font-medium font-mono">
                          {data.spec?.podCIDR || t('detail.fields.na')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Node Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('detail.sections.nodeInformation')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.created')}
                        </Label>
                        <p className="text-sm">
                          {formatDate(
                            data.metadata?.creationTimestamp || '',
                            true
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.kubeletVersion')}
                        </Label>
                        <p className="text-sm">
                          {data.status?.nodeInfo?.kubeletVersion ||
                            t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.hostname')}
                        </Label>
                        <p className="text-sm font-mono">
                          {data.status?.addresses?.find(
                            (addr) => addr.type === 'Hostname'
                          )?.address || t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.externalIP')}
                        </Label>
                        <p className="text-sm font-mono">
                          {data.status?.addresses?.find(
                            (addr) => addr.type === 'ExternalIP'
                          )?.address || t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.osImage')}
                        </Label>
                        <p className="text-sm">
                          {data.status?.nodeInfo?.osImage || t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.kernelVersion')}
                        </Label>
                        <p className="text-sm">
                          {data.status?.nodeInfo?.kernelVersion ||
                            t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.architecture')}
                        </Label>
                        <p className="text-sm">
                          {data.status?.nodeInfo?.architecture ||
                            t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.containerRuntime')}
                        </Label>
                        <p className="text-sm">
                          {data.status?.nodeInfo?.containerRuntimeVersion ||
                            t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.kubeProxyVersion')}
                        </Label>
                        <p className="text-sm">
                          {data.status?.nodeInfo?.kubeProxyVersion ||
                            t('detail.fields.na')}
                        </p>
                      </div>
                    </div>
                    <LabelsAnno
                      labels={data.metadata?.labels || {}}
                      annotations={data.metadata?.annotations || {}}
                    />
                  </CardContent>
                </Card>

                {/* Resource Capacity & Allocation */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('detail.sections.resourceCapacity')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-medium mb-3">
                          CPU & {t('detail.fields.memory')}
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">CPU</p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.capacity')}:{' '}
                                {data.status?.capacity?.cpu
                                  ? formatCPU(data.status.capacity.cpu)
                                  : t('detail.fields.na')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {data.status?.allocatable?.cpu
                                  ? formatCPU(data.status.allocatable.cpu)
                                  : t('detail.fields.na')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.allocatable')}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center p-3 border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">
                                {t('detail.fields.memory')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.capacity')}:{' '}
                                {data.status?.capacity?.memory
                                  ? formatMemory(data.status.capacity.memory)
                                  : t('detail.fields.na')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {data.status?.allocatable?.memory
                                  ? formatMemory(data.status.allocatable.memory)
                                  : t('detail.fields.na')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.allocatable')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-3">
                          {t('detail.fields.pods')} & {t('detail.fields.storage')}
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">
                                {t('detail.fields.pods')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.capacity')}:{' '}
                                {data.status?.capacity?.pods ||
                                  t('detail.fields.na')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {data.status?.allocatable?.pods ||
                                  t('detail.fields.na')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.allocatable')}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center p-3 border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">
                                {t('detail.fields.storage')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.capacity')}:{' '}
                                {data.status?.capacity?.['ephemeral-storage']
                                  ? formatMemory(
                                      data.status.capacity['ephemeral-storage']
                                    )
                                  : t('detail.fields.na')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {data.status?.allocatable?.['ephemeral-storage']
                                  ? formatMemory(
                                      data.status.allocatable[
                                        'ephemeral-storage'
                                      ]
                                    )
                                  : t('detail.fields.na')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('detail.fields.allocatable')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Node Taints */}
                {data.spec?.taints && data.spec.taints.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('detail.sections.nodeTaints')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-2">
                        {data.spec.taints.map((taint, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 border rounded-lg"
                          >
                            <Badge variant="secondary">{taint.effect}</Badge>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{taint.key}</p>
                              {taint.value && (
                                <p className="text-xs text-muted-foreground">
                                  = {taint.value}
                                </p>
                              )}
                            </div>
                            {taint.timeAdded && (
                              <p className="text-xs text-muted-foreground">
                                {formatDate(taint.timeAdded)}
                              </p>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUntaint(taint.key)}
                            >
                              {t('detail.buttons.remove')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Node Conditions */}
                {data.status?.conditions &&
                  data.status.conditions.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {t('detail.sections.nodeConditions')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {enrichNodeConditionsWithHealth(
                            data.status.conditions
                          ).map((condition, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-3 border rounded-lg"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    condition.health === 'True'
                                      ? 'bg-green-500'
                                      : condition.health === 'False'
                                        ? 'bg-red-500'
                                        : 'bg-yellow-500'
                                  }`}
                                />
                                <Badge
                                  variant={
                                    condition.health === 'True'
                                      ? 'default'
                                      : 'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {condition.type}
                                </Badge>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground truncate">
                                  {condition.message ||
                                    condition.reason ||
                                    'No message'}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {condition.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
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
                <YamlEditor<'nodes'>
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
          ...(relatedPods && relatedPods.length > 0
            ? [
                {
                  value: 'pods',
                  label: (
                    <>
                      Pods{' '}
                      {relatedPods && (
                        <Badge variant="secondary">{relatedPods.length}</Badge>
                      )}
                    </>
                  ),
                  content: (
                    <PodTable
                      pods={relatedPods}
                      isLoading={isLoadingRelated}
                      hiddenNode
                    />
                  ),
                },
              ]
            : []),
          {
            value: 'monitor',
            label: t('detail.tabs.monitor'),
            content: <NodeMonitoring name={name} />,
          },
          {
            value: 'Terminal',
            label: t('detail.tabs.terminal'),
            content: (
              <div className="space-y-6">
                <Terminal type="node" nodeName={name} />
              </div>
            ),
          },
          {
            value: 'events',
            label: t('detail.tabs.events'),
            content: (
              <EventTable
                resource={'nodes'}
                namespace={undefined}
                name={name}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
