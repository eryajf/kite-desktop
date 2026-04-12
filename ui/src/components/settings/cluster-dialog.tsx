import { useMemo, useState } from 'react'
import { IconEdit, IconInfoCircle, IconServer } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { Cluster } from '@/types/api'
import {
  ClusterConnectionTestResponse,
  ClusterCreateRequest,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ClusterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cluster?: Cluster | null
  onSubmit: (clusterData: ClusterCreateRequest) => void
  onTestConnection?: (
    clusterData: ClusterCreateRequest
  ) => Promise<ClusterConnectionTestResponse>
}

function createClusterFormData(cluster?: Cluster | null) {
  return {
    name: cluster?.name || '',
    description: cluster?.description || '',
    config: cluster?.config || '',
    prometheusURL: cluster?.prometheusURL || '',
    enabled: cluster?.enabled ?? true,
    isDefault: cluster?.isDefault ?? false,
    inCluster: cluster?.inCluster ?? false,
  }
}

export function ClusterDialog({
  open,
  onOpenChange,
  cluster,
  onSubmit,
  onTestConnection,
}: ClusterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ClusterDialogContent
          key={cluster?.id ?? 'new'}
          cluster={cluster}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          onTestConnection={onTestConnection}
        />
      ) : null}
    </Dialog>
  )
}

function ClusterDialogContent({
  cluster,
  onOpenChange,
  onSubmit,
  onTestConnection,
}: Omit<ClusterDialogProps, 'open'>) {
  const { t } = useTranslation()
  const isEditMode = !!cluster

  const [formData, setFormData] = useState(() => createClusterFormData(cluster))
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle')
  const [testMessage, setTestMessage] = useState('')
  const [testedSignature, setTestedSignature] = useState<string | null>(null)

  const connectionSignature = useMemo(
    () =>
      JSON.stringify({
        inCluster: formData.inCluster,
        config: formData.config.trim(),
        prometheusURL: formData.prometheusURL.trim(),
      }),
    [formData.inCluster, formData.config, formData.prometheusURL]
  )

  const canTestConnection =
    !!onTestConnection && (formData.inCluster || !!formData.config.trim())
  const isConnectionVerified =
    !isEditMode &&
    testStatus === 'success' &&
    testedSignature === connectionSignature

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const handleChange = (field: string, value: string | boolean) => {
    const nextValue =
      typeof value === 'string' ? value : String(value)
    const currentValue =
      typeof formData[field as keyof typeof formData] === 'string'
        ? String(formData[field as keyof typeof formData])
        : String(formData[field as keyof typeof formData])

    if (
      ['config', 'prometheusURL', 'inCluster'].includes(field) &&
      currentValue !== nextValue
    ) {
      setTestStatus('idle')
      setTestMessage('')
      setTestedSignature(null)
    }

    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleTestConnection = async () => {
    if (!onTestConnection || !canTestConnection) {
      return
    }

    setTestStatus('testing')
    setTestMessage('')

    try {
      const result = await onTestConnection(formData)
      setTestedSignature(connectionSignature)
      setTestStatus('success')
      setTestMessage(
        result.version
          ? t('clusterManagement.messages.testSuccessWithVersion', {
              defaultValue:
                'Connection successful. Kubernetes version: {{version}}',
              version: result.version,
            })
          : t(
              'clusterManagement.messages.testSuccess',
              'Connection successful.'
            )
      )
    } catch (error) {
      setTestedSignature(null)
      setTestStatus('error')
      setTestMessage(
        error instanceof Error
          ? error.message
          : t(
              'clusterManagement.messages.testError',
              'Cluster connection test failed'
            )
      )
    }
  }

  return (
    <DialogContent className="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {isEditMode ? (
            <IconEdit className="h-5 w-5" />
          ) : (
            <IconServer className="h-5 w-5" />
          )}
          {isEditMode
            ? t('clusterManagement.dialog.edit.title', 'Edit Cluster')
            : t('clusterManagement.dialog.add.title', 'Add New Cluster')}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cluster-name">
              {t('clusterManagement.form.name.label', 'Cluster Name')} *
            </Label>
            <Input
              id="cluster-name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder={t(
                'clusterManagement.form.name.placeholder',
                'e.g., production, staging'
              )}
              required
            />
          </div>

          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="cluster-type">
                {t('clusterManagement.form.type.label', 'Cluster Type')}
              </Label>
              <Select
                value={formData.inCluster ? 'inCluster' : 'external'}
                onValueChange={(value) =>
                  handleChange('inCluster', value === 'inCluster')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">
                    {t(
                      'clusterManagement.form.type.external',
                      'External Cluster'
                    )}
                  </SelectItem>
                  <SelectItem value="inCluster">
                    {t('clusterManagement.form.type.inCluster', 'In-Cluster')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cluster-description">
            {t('clusterManagement.form.description.label', 'Description')}
          </Label>
          <Textarea
            id="cluster-description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder={t(
              'clusterManagement.form.description.placeholder',
              'Brief description of this cluster'
            )}
            rows={2}
          />
        </div>

        {!formData.inCluster && (
          <div className="space-y-2">
            <Label htmlFor="cluster-config">
              {t('clusterManagement.form.config.label', 'Kubeconfig')}
              {!isEditMode && ' *'}
            </Label>
            {isEditMode && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'clusterManagement.form.config.editNote',
                  'Leave empty to keep current configuration'
                )}
              </p>
            )}
            <Textarea
              id="cluster-config"
              value={formData.config}
              onChange={(e) => handleChange('config', e.target.value)}
              placeholder={t(
                'clusterManagement.form.kubeconfig.placeholder',
                'Paste your kubeconfig content here...'
              )}
              rows={8}
              className="text-sm"
              required={!isEditMode && !formData.inCluster}
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="prometheus-url">
              {t('clusterManagement.form.prometheusURL.label', 'Prometheus URL')}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t(
                    'clusterManagement.form.prometheusURL.label',
                    'Prometheus URL'
                  )}
                >
                  <IconInfoCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs leading-relaxed">
                {t(
                  'clusterManagement.form.prometheusURL.help',
                  'Optional. Used to enable Prometheus-based monitoring features such as overview history charts and Pod metrics. If left empty, Kite will try to discover a Prometheus service in the cluster automatically.'
                )}
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="prometheus-url"
            value={formData.prometheusURL}
            onChange={(e) => handleChange('prometheusURL', e.target.value)}
            type="url"
          />
        </div>

        {/* Cluster Status Controls */}
        <div className="space-y-4 border-t pt-4">
          {/* Enabled Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="cluster-enabled">
                {t('clusterManagement.form.enabled.label', 'Enable Cluster')}
              </Label>
            </div>
            <Switch
              id="cluster-enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) => handleChange('enabled', checked)}
            />
          </div>

          {/* Default Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="cluster-default">
                {t('clusterManagement.form.isDefault.label', 'Set as Default')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'clusterManagement.form.isDefault.help',
                  'Use this cluster as the default for new operations'
                )}
              </p>
            </div>
            <Switch
              id="cluster-default"
              checked={formData.isDefault}
              onCheckedChange={(checked) => handleChange('isDefault', checked)}
            />
          </div>
        </div>

        {formData.inCluster && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {t(
                'clusterManagement.form.inCluster.note',
                'This cluster uses the in-cluster service account configuration. No additional kubeconfig is required.'
              )}
            </p>
          </div>
        )}

        {!isEditMode && onTestConnection && (
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              {testStatus === 'success' && (
                <p className="text-emerald-600">{testMessage}</p>
              )}
              {testStatus === 'error' && (
                <p className="text-destructive">{testMessage}</p>
              )}
              {testStatus === 'idle' && (
                <p className="text-muted-foreground">
                  {t(
                    'clusterManagement.messages.testRequired',
                    'Test the cluster connection before adding it.'
                  )}
                </p>
              )}
              {testStatus === 'testing' && (
                <p className="text-muted-foreground">
                  {t(
                    'clusterManagement.messages.testing',
                    'Testing cluster connection...'
                  )}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
            disabled={!canTestConnection || testStatus === 'testing'}
            >
              {testStatus === 'testing'
                ? t(
                    'clusterManagement.actions.testingConnection',
                    'Testing...'
                  )
                : t('clusterManagement.actions.testConnection', 'Test Connection')}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              !formData.name.trim() ||
              (!isEditMode &&
                !formData.inCluster &&
                !formData.config.trim()) ||
              (!isEditMode && !isConnectionVerified) ||
              testStatus === 'testing'
            }
          >
            {isEditMode
              ? t('clusterManagement.actions.save', 'Save Changes')
              : t('clusterManagement.actions.add', 'Add Cluster')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
