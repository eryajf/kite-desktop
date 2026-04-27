import { useEffect, useState } from 'react'
import { useRuntime } from '@/contexts/runtime-context'
import {
  IconCheck,
  IconInfoCircle,
  IconPlugConnected,
  IconRefresh,
  IconRobot,
  IconSettings,
  IconTerminal2,
} from '@tabler/icons-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  fetchGeneralAIModels,
  GeneralAIValidationRequest,
  GeneralSettingUpdateRequest,
  testGeneralAIConnection,
  updateGeneralSetting,
  useGeneralSetting,
} from '@/lib/api'
import { translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5'
const DEFAULT_AI_MAX_TOKENS = 8192
const DEFAULT_KUBECTL_IMAGE = 'docker.cnb.cool/znb/images/kubectl:latest'
const DEFAULT_NODE_TERMINAL_IMAGE = 'docker.cnb.cool/znb/images/busybox:latest'

interface GeneralSettingsFormData {
  aiAgentEnabled: boolean
  aiProvider: 'openai' | 'anthropic'
  aiModel: string
  aiApiKey: string
  aiApiKeyConfigured: boolean
  aiBaseUrl: string
  aiMaxTokens: number
  aiChatHistorySessionLimit: number
  aiChatOpenMode: 'overlay' | 'sidecar'
  kubectlEnabled: boolean
  kubectlImage: string
  nodeTerminalImage: string
  enableAnalytics: boolean
  enableVersionCheck: boolean
  updateSource: 'auto' | 'github' | 'cnb'
}

interface GeneralAIConnectionState {
  status: 'success' | 'error'
  message: string
  reply?: string
}

interface SettingHelpTooltipProps {
  label: string
  content: string
}

function SettingHelpTooltip({ label, content }: SettingHelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`${label} help`}
        >
          <IconInfoCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

export function shouldReloadForAnalyticsChange(
  previousEnableAnalytics: boolean | undefined,
  nextEnableAnalytics: boolean
) {
  return (
    typeof previousEnableAnalytics === 'boolean' &&
    previousEnableAnalytics !== nextEnableAnalytics
  )
}

export const browserRuntime = {
  reloadWindow() {
    window.location.reload()
  },
}

export function GeneralManagement() {
  const { t } = useTranslation()
  const { isDesktop } = useRuntime()
  const queryClient = useQueryClient()
  const { data, isLoading } = useGeneralSetting()
  const [formData, setFormData] = useState<GeneralSettingsFormData>({
    aiAgentEnabled: false,
    aiProvider: 'openai',
    aiModel: DEFAULT_MODEL,
    aiApiKey: '',
    aiApiKeyConfigured: false,
    aiBaseUrl: '',
    aiMaxTokens: DEFAULT_AI_MAX_TOKENS,
    aiChatHistorySessionLimit: 200,
    aiChatOpenMode: 'sidecar',
    kubectlEnabled: true,
    kubectlImage: DEFAULT_KUBECTL_IMAGE,
    nodeTerminalImage: DEFAULT_NODE_TERMINAL_IMAGE,
    enableAnalytics: true,
    enableVersionCheck: true,
    updateSource: 'auto',
  })
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [connectionState, setConnectionState] =
    useState<GeneralAIConnectionState | null>(null)

  useEffect(() => {
    if (!data) return
    setFormData({
      aiAgentEnabled: data.aiAgentEnabled,
      aiProvider: data.aiProvider || 'openai',
      aiModel: data.aiModel || DEFAULT_MODEL,
      aiApiKey: '',
      aiApiKeyConfigured: data.aiApiKeyConfigured ?? false,
      aiBaseUrl: data.aiBaseUrl || '',
      aiMaxTokens: data.aiMaxTokens || DEFAULT_AI_MAX_TOKENS,
      aiChatHistorySessionLimit: data.aiChatHistorySessionLimit || 200,
      aiChatOpenMode: data.aiChatOpenMode || 'sidecar',
      kubectlEnabled: data.kubectlEnabled ?? true,
      kubectlImage: data.kubectlImage || DEFAULT_KUBECTL_IMAGE,
      nodeTerminalImage: data.nodeTerminalImage || DEFAULT_NODE_TERMINAL_IMAGE,
      enableAnalytics: data.enableAnalytics ?? true,
      enableVersionCheck: data.enableVersionCheck ?? true,
      updateSource: data.updateSource || 'auto',
    })
    setAvailableModels([])
    setModelPickerOpen(false)
    setConnectionState(null)
  }, [data])

  useEffect(() => {
    setAvailableModels([])
    setModelPickerOpen(false)
    setConnectionState(null)
  }, [formData.aiProvider, formData.aiBaseUrl, formData.aiApiKey])

  const mutation = useMutation({
    mutationFn: (payload: GeneralSettingUpdateRequest) =>
      updateGeneralSetting(payload),
    onSuccess: (updated) => {
      if (
        shouldReloadForAnalyticsChange(
          data?.enableAnalytics,
          updated.enableAnalytics
        )
      ) {
        browserRuntime.reloadWindow()
        return
      }

      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'general-setting' ||
          query.queryKey[0] === 'ai-status',
      })
      toast.success(
        t('generalManagement.messages.updated', 'General settings updated')
      )
    },
    onError: (error) => {
      toast.error(translateError(error, t))
    },
  })

  const fetchModelsMutation = useMutation({
    mutationFn: (payload: GeneralAIValidationRequest) =>
      fetchGeneralAIModels(payload),
    onSuccess: (result) => {
      setAvailableModels(result.models)
      setModelPickerOpen(true)
      toast.success(
        t('generalManagement.messages.modelsLoaded', {
          defaultValue: 'Loaded {{count}} models.',
          count: result.models.length,
        })
      )
    },
    onError: (error) => {
      setAvailableModels([])
      setModelPickerOpen(false)
      toast.error(translateError(error, t))
    },
  })

  const testConnectionMutation = useMutation({
    mutationFn: (payload: GeneralAIValidationRequest) =>
      testGeneralAIConnection(payload),
    onSuccess: (result) => {
      setConnectionState({
        status: 'success',
        message: result.message,
        reply: result.reply,
      })
      toast.success(
        t(
          'generalManagement.messages.connectionTestSuccess',
          'Connection test succeeded.'
        )
      )
    },
    onError: (error) => {
      const message = translateError(error, t)
      setConnectionState({
        status: 'error',
        message,
      })
      toast.error(message)
    },
  })

  const buildGeneralAIValidationPayload = (options: {
    requireModel: boolean
  }): GeneralAIValidationRequest | null => {
    if (!formData.aiApiKey.trim() && !formData.aiApiKeyConfigured) {
      toast.error(
        t(
          'generalManagement.errors.apiKeyRequired',
          'API Key is required when AI Agent is enabled'
        )
      )
      return null
    }

    if (options.requireModel && !formData.aiModel.trim()) {
      toast.error(
        t('generalManagement.errors.modelRequired', 'Model is required')
      )
      return null
    }

    const payload: GeneralAIValidationRequest = {
      aiProvider: formData.aiProvider,
      aiBaseUrl: formData.aiBaseUrl.trim(),
    }

    if (options.requireModel) {
      payload.aiModel = formData.aiModel.trim()
    }
    if (formData.aiApiKey.trim()) {
      payload.aiApiKey = formData.aiApiKey.trim()
    }

    return payload
  }

  const handleFetchModels = () => {
    const payload = buildGeneralAIValidationPayload({ requireModel: false })
    if (!payload) {
      return
    }

    fetchModelsMutation.mutate(payload)
  }

  const handleTestConnection = () => {
    const payload = buildGeneralAIValidationPayload({ requireModel: true })
    if (!payload) {
      return
    }

    testConnectionMutation.mutate(payload)
  }

  const handleSave = () => {
    const defaultModel =
      formData.aiProvider === 'anthropic'
        ? DEFAULT_ANTHROPIC_MODEL
        : DEFAULT_MODEL

    if (formData.aiAgentEnabled && !formData.aiModel.trim()) {
      toast.error(
        t('generalManagement.errors.modelRequired', 'Model is required')
      )
      return
    }
    if (
      formData.aiAgentEnabled &&
      !formData.aiApiKey.trim() &&
      !formData.aiApiKeyConfigured
    ) {
      toast.error(
        t(
          'generalManagement.errors.apiKeyRequired',
          'API Key is required when AI Agent is enabled'
        )
      )
      return
    }
    if (formData.kubectlEnabled && !formData.kubectlImage.trim()) {
      toast.error(
        t(
          'generalManagement.errors.kubectlImageRequired',
          'Kubectl image is required when kubectl is enabled'
        )
      )
      return
    }
    if (!formData.nodeTerminalImage.trim()) {
      toast.error(
        t(
          'generalManagement.errors.nodeTerminalImageRequired',
          'Node terminal image is required'
        )
      )
      return
    }

    const payload: GeneralSettingUpdateRequest = {
      aiAgentEnabled: formData.aiAgentEnabled,
      aiProvider: formData.aiProvider,
      aiModel: formData.aiModel.trim() || defaultModel,
      aiBaseUrl: formData.aiBaseUrl.trim(),
      aiMaxTokens: formData.aiMaxTokens || DEFAULT_AI_MAX_TOKENS,
      aiChatHistorySessionLimit: formData.aiChatHistorySessionLimit || 200,
      aiChatOpenMode: formData.aiChatOpenMode,
      kubectlEnabled: formData.kubectlEnabled,
      kubectlImage: formData.kubectlImage.trim() || DEFAULT_KUBECTL_IMAGE,
      nodeTerminalImage:
        formData.nodeTerminalImage.trim() || DEFAULT_NODE_TERMINAL_IMAGE,
      enableAnalytics: formData.enableAnalytics,
      enableVersionCheck: formData.enableVersionCheck,
      updateSource: formData.updateSource,
    }
    if (formData.aiApiKey.trim()) {
      payload.aiApiKey = formData.aiApiKey.trim()
    }

    mutation.mutate(payload)
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">
          {t('common.loading', 'Loading...')}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSettings className="h-5 w-5" />
          {t('generalManagement.title', 'General')}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border">
          <div className="flex items-center justify-between p-3">
            <div>
              <Label className="flex items-center gap-2 text-sm font-medium">
                <IconRobot className="h-4 w-4" />
                <span>{t('generalManagement.aiAgent.title', 'AI Agent')}</span>
                <SettingHelpTooltip
                  label={t('generalManagement.aiAgent.title', 'AI Agent')}
                  content={t(
                    'generalManagement.aiAgent.description',
                    'Enable AI assistant and configure model endpoint.'
                  )}
                />
              </Label>
            </div>
            <Switch
              checked={formData.aiAgentEnabled}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, aiAgentEnabled: checked }))
              }
            />
          </div>

          {formData.aiAgentEnabled && (
            <div className="space-y-4 border-t p-3">
              <div className="space-y-2">
                <Label htmlFor="general-ai-provider">
                  {t('generalManagement.aiAgent.form.provider', 'Provider')}
                </Label>
                <Select
                  value={formData.aiProvider}
                  onValueChange={(value: 'openai' | 'anthropic') =>
                    setFormData((prev) => ({
                      ...prev,
                      aiProvider: value,
                      aiModel:
                        value === 'anthropic'
                          ? prev.aiModel || DEFAULT_ANTHROPIC_MODEL
                          : prev.aiModel || DEFAULT_MODEL,
                    }))
                  }
                >
                  <SelectTrigger id="general-ai-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">
                      {t(
                        'generalManagement.aiAgent.form.providers.openai',
                        'OpenAI Compatible'
                      )}
                    </SelectItem>
                    <SelectItem value="anthropic">
                      {t(
                        'generalManagement.aiAgent.form.providers.anthropic',
                        'Anthropic Compatible'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="general-ai-base-url">
                    {t('generalManagement.aiAgent.form.baseUrl', 'Base URL')}
                  </Label>
                  <Input
                    id="general-ai-base-url"
                    value={formData.aiBaseUrl}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        aiBaseUrl: e.target.value,
                      }))
                    }
                    placeholder={
                      formData.aiProvider === 'anthropic'
                        ? 'https://api.anthropic.com'
                        : 'https://api.openai.com/v1'
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="general-ai-api-key">
                    {t('generalManagement.aiAgent.form.apiKey', 'API Key')}
                  </Label>
                  <Input
                    id="general-ai-api-key"
                    type="password"
                    value={formData.aiApiKey}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        aiApiKey: e.target.value,
                      }))
                    }
                    placeholder={
                      formData.aiApiKeyConfigured
                        ? t(
                            'generalManagement.aiAgent.form.apiKeyPlaceholder',
                            'Leave empty to keep current API Key'
                          )
                        : 'sk-...'
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="general-ai-model">
                      {t('generalManagement.aiAgent.form.model', 'Model')}
                    </Label>
                    <SettingHelpTooltip
                      label={t('generalManagement.aiAgent.form.model', 'Model')}
                      content={t(
                        'generalManagement.aiAgent.form.modelHint',
                        'You can type a model name manually, or fetch the provider model list and choose one.'
                      )}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="general-ai-model"
                      value={formData.aiModel}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          aiModel: e.target.value,
                        }))
                      }
                      placeholder={
                        formData.aiProvider === 'anthropic'
                          ? DEFAULT_ANTHROPIC_MODEL
                          : DEFAULT_MODEL
                      }
                      className="flex-1"
                    />
                    <Popover
                      open={modelPickerOpen && availableModels.length > 0}
                      onOpenChange={(open) =>
                        setModelPickerOpen(open && availableModels.length > 0)
                      }
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="sm:w-auto"
                          disabled={fetchModelsMutation.isPending}
                          onClick={(event) => {
                            event.preventDefault()
                            handleFetchModels()
                          }}
                        >
                          <IconRefresh className="h-4 w-4" />
                          {fetchModelsMutation.isPending
                            ? t(
                                'generalManagement.aiAgent.form.fetchingModels',
                                'Fetching...'
                              )
                            : t(
                                'generalManagement.aiAgent.form.fetchModels',
                                'Fetch Models'
                              )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-[min(32rem,calc(100vw-2rem))] p-0"
                      >
                        <Command>
                          <CommandInput
                            placeholder={t(
                              'generalManagement.aiAgent.form.searchModels',
                              'Search models...'
                            )}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {t(
                                'generalManagement.aiAgent.form.noModels',
                                'No models found.'
                              )}
                            </CommandEmpty>
                            {availableModels.map((item) => (
                              <CommandItem
                                key={item}
                                value={item}
                                onSelect={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    aiModel: item,
                                  }))
                                  setModelPickerOpen(false)
                                }}
                              >
                                {item}
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-sm">
                          {t(
                            'generalManagement.aiAgent.form.connectionTest',
                            'Connection Test'
                          )}
                        </Label>
                        <SettingHelpTooltip
                          label={t(
                            'generalManagement.aiAgent.form.connectionTest',
                            'Connection Test'
                          )}
                          content={t(
                            'generalManagement.aiAgent.form.connectionTestHint',
                            'Send a short "hi" request with the current Base URL, API Key, and model to verify the service is working.'
                          )}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={testConnectionMutation.isPending}
                      onClick={handleTestConnection}
                    >
                      <IconPlugConnected className="h-4 w-4" />
                      {testConnectionMutation.isPending
                        ? t(
                            'generalManagement.aiAgent.form.testingConnection',
                            'Testing...'
                          )
                        : t(
                            'generalManagement.aiAgent.form.testConnection',
                            'Test Configuration'
                          )}
                    </Button>
                  </div>
                </div>

                {connectionState ? (
                  <div
                    className={`rounded-md border px-3 py-2 text-sm md:col-span-2 ${
                      connectionState.status === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-destructive/20 bg-destructive/5 text-destructive'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {connectionState.status === 'success' ? (
                        <IconCheck className="h-4 w-4" />
                      ) : null}
                      <span>{connectionState.message}</span>
                    </div>
                    {connectionState.reply ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs">
                        {connectionState.reply}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="general-ai-max-tokens">
                      {t(
                        'generalManagement.aiAgent.form.maxTokens',
                        'Max Tokens'
                      )}
                    </Label>
                    <SettingHelpTooltip
                      label={t(
                        'generalManagement.aiAgent.form.maxTokens',
                        'Max Tokens'
                      )}
                      content={t(
                        'generalManagement.aiAgent.form.maxTokensHelp',
                        'Controls the maximum tokens the model may generate in a single reply. Larger values allow longer answers, but may increase latency and token usage.'
                      )}
                    />
                  </div>
                  <Input
                    id="general-ai-max-tokens"
                    type="number"
                    min="1"
                    max="128000"
                    value={formData.aiMaxTokens}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        aiMaxTokens:
                          parseInt(e.target.value) || DEFAULT_AI_MAX_TOKENS,
                      }))
                    }
                    placeholder={String(DEFAULT_AI_MAX_TOKENS)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="general-ai-history-session-limit">
                      {t(
                        'generalManagement.aiAgent.form.chatHistorySessionLimit',
                        'Chat History Session Limit'
                      )}
                    </Label>
                    <SettingHelpTooltip
                      label={t(
                        'generalManagement.aiAgent.form.chatHistorySessionLimit',
                        'Chat History Session Limit'
                      )}
                      content={t(
                        'generalManagement.aiAgent.form.chatHistorySessionLimitHint',
                        'Maximum number of AI chat sessions to keep per cluster.'
                      )}
                    />
                  </div>
                  <Input
                    id="general-ai-history-session-limit"
                    type="number"
                    min="1"
                    value={formData.aiChatHistorySessionLimit}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        aiChatHistorySessionLimit:
                          parseInt(e.target.value) || 200,
                      }))
                    }
                    placeholder="200"
                  />
                </div>

                {isDesktop ? (
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="general-ai-open-mode">
                        {t(
                          'generalManagement.aiAgent.form.openMode',
                          'AI Chat Open Mode'
                        )}
                      </Label>
                      <SettingHelpTooltip
                        label={t(
                          'generalManagement.aiAgent.form.openMode',
                          'AI Chat Open Mode'
                        )}
                        content={t(
                          'generalManagement.aiAgent.form.openModeHint',
                          'Choose whether AI chat opens as an in-window overlay or a docked sidecar window.'
                        )}
                      />
                    </div>
                    <Select
                      value={formData.aiChatOpenMode}
                      onValueChange={(value: 'overlay' | 'sidecar') =>
                        setFormData((prev) => ({
                          ...prev,
                          aiChatOpenMode: value,
                        }))
                      }
                    >
                      <SelectTrigger id="general-ai-open-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="overlay">
                          {t(
                            'generalManagement.aiAgent.form.openModes.overlay',
                            'Overlay'
                          )}
                        </SelectItem>
                        <SelectItem value="sidecar">
                          {t(
                            'generalManagement.aiAgent.form.openModes.sidecar',
                            'Sidecar Window'
                          )}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border">
            <div className="flex items-center justify-between p-3">
              <div>
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <IconTerminal2 className="h-4 w-4" />
                  <span>{t('generalManagement.kubectl.title', 'Kubectl')}</span>
                  <SettingHelpTooltip
                    label={t('generalManagement.kubectl.title', 'Kubectl')}
                    content={t(
                      'generalManagement.kubectl.description',
                      'Enable kubectl terminal and configure runtime image.'
                    )}
                  />
                </Label>
              </div>
              <Switch
                checked={formData.kubectlEnabled}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, kubectlEnabled: checked }))
                }
              />
            </div>

            {formData.kubectlEnabled && (
              <div className="space-y-2 border-t p-3">
                <Label htmlFor="general-kubectl-image">
                  {t('generalManagement.kubectl.form.image', 'Image')}
                </Label>
                <Input
                  id="general-kubectl-image"
                  value={formData.kubectlImage}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      kubectlImage: e.target.value,
                    }))
                  }
                  placeholder={DEFAULT_KUBECTL_IMAGE}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div>
              <Label className="flex items-center gap-2 text-sm font-medium">
                <IconTerminal2 className="h-4 w-4" />
                <span>
                  {t('generalManagement.nodeTerminal.title', 'Node Terminal')}
                </span>
                <SettingHelpTooltip
                  label={t(
                    'generalManagement.nodeTerminal.title',
                    'Node Terminal'
                  )}
                  content={t(
                    'generalManagement.nodeTerminal.description',
                    'Configure runtime image used for node terminal sessions.'
                  )}
                />
              </Label>
            </div>

            <div className="mt-3 space-y-2">
              <Label htmlFor="general-node-terminal-image">
                {t('generalManagement.nodeTerminal.form.image', 'Image')}
              </Label>
              <Input
                id="general-node-terminal-image"
                value={formData.nodeTerminalImage}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    nodeTerminalImage: e.target.value,
                  }))
                }
                placeholder={DEFAULT_NODE_TERMINAL_IMAGE}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="p-3">
            <Label className="text-sm font-medium">
              {t('generalManagement.runtime.title', 'Runtime')}
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                'generalManagement.runtime.description',
                'Configure usage analytics and version checking. Analytics is enabled by default, and turning it off does not disable version checks.'
              )}
            </p>
          </div>

          <div className="flex items-center justify-between border-t p-3">
            <Label htmlFor="general-enable-analytics" className="text-sm">
              {t(
                'generalManagement.runtime.form.enableAnalytics',
                'Enable analytics'
              )}
            </Label>
            <Switch
              id="general-enable-analytics"
              checked={formData.enableAnalytics}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, enableAnalytics: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between border-t p-3">
            <Label htmlFor="general-enable-version-check" className="text-sm">
              {t(
                'generalManagement.runtime.form.enableVersionCheck',
                'Enable version check'
              )}
            </Label>
            <Switch
              id="general-enable-version-check"
              checked={formData.enableVersionCheck}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  enableVersionCheck: checked,
                }))
              }
            />
          </div>

          <div className="space-y-2 border-t p-3">
            <Label htmlFor="general-update-source" className="text-sm">
              {t(
                'generalManagement.runtime.form.updateSource',
                'Update download source'
              )}
            </Label>
            <Select
              value={formData.updateSource}
              onValueChange={(value: 'auto' | 'github' | 'cnb') =>
                setFormData((prev) => ({ ...prev, updateSource: value }))
              }
            >
              <SelectTrigger id="general-update-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {t(
                    'generalManagement.runtime.form.updateSources.auto',
                    'Auto'
                  )}
                </SelectItem>
                <SelectItem value="github">
                  {t(
                    'generalManagement.runtime.form.updateSources.github',
                    'GitHub'
                  )}
                </SelectItem>
                <SelectItem value="cnb">
                  {t('generalManagement.runtime.form.updateSources.cnb', 'CNB')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                'generalManagement.runtime.form.updateSourceHint',
                'GitHub is recommended for users outside mainland China. CNB is recommended for users in mainland China.'
              )}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
