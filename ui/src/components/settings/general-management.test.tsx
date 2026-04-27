import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as GeneralManagementModule from './general-management'

const { useGeneralSetting, updateGeneralSetting } = vi.hoisted(() => ({
  useGeneralSetting: vi.fn(),
  updateGeneralSetting: vi.fn(),
}))

const { fetchGeneralAIModels, testGeneralAIConnection } = vi.hoisted(() => ({
  fetchGeneralAIModels: vi.fn(),
  testGeneralAIConnection: vi.fn(),
}))

const { successToast, errorToast } = vi.hoisted(() => ({
  successToast: vi.fn(),
  errorToast: vi.fn(),
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        fallbackOrOptions?: string | { defaultValue?: string; version?: string }
      ) => {
        if (typeof fallbackOrOptions === 'string') {
          return fallbackOrOptions
        }
        if (fallbackOrOptions?.defaultValue) {
          return fallbackOrOptions.defaultValue.replace(
            '{{version}}',
            fallbackOrOptions.version ?? ''
          )
        }
        return key
      },
    }),
  }
})

vi.mock('@/contexts/runtime-context', () => ({
  useRuntime: vi.fn(() => ({
    isDesktop: true,
  })),
}))

vi.mock('@/lib/api', () => ({
  useGeneralSetting,
  updateGeneralSetting,
  fetchGeneralAIModels,
  testGeneralAIConnection,
}))

vi.mock('sonner', () => ({
  toast: {
    success: successToast,
    error: errorToast,
  },
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: (props: ComponentProps<'input'>) => <input {...props} />,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: ReactNode
    onSelect?: (value: string) => void
    value: string
  }) => (
    <button type="button" onClick={() => onSelect?.(value)}>
      {children}
    </button>
  ),
}))

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <GeneralManagementModule.GeneralManagement />
    </QueryClientProvider>
  )
}

describe('GeneralManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchGeneralAIModels.mockResolvedValue({
      models: ['claude-sonnet-4-5', 'gpt-4o-mini'],
    })
    testGeneralAIConnection.mockResolvedValue({
      message: 'Connection test succeeded.',
      reply: 'hello from test',
    })

    useGeneralSetting.mockReturnValue({
      data: {
        aiAgentEnabled: true,
        aiProvider: 'openai',
        aiModel: 'gpt-4o-mini',
        aiApiKey: '',
        aiApiKeyConfigured: true,
        aiBaseUrl: '',
        aiMaxTokens: 8192,
        aiChatHistorySessionLimit: 200,
        aiChatOpenMode: 'sidecar',
        kubectlEnabled: true,
        kubectlImage: 'docker.cnb.cool/znb/images/kubectl:latest',
        nodeTerminalImage: 'docker.cnb.cool/znb/images/busybox:latest',
        enableAnalytics: true,
        enableVersionCheck: true,
        updateSource: 'auto',
      },
      isLoading: false,
    })
  })

  it('reloads the app after analytics is disabled so the injected script is removed', async () => {
    const user = userEvent.setup()
    const reloadSpy = vi
      .spyOn(GeneralManagementModule.browserRuntime, 'reloadWindow')
      .mockImplementation(() => undefined)

    updateGeneralSetting.mockResolvedValue({
      aiAgentEnabled: false,
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
      aiApiKey: '',
      aiApiKeyConfigured: false,
      aiBaseUrl: '',
      aiMaxTokens: 8192,
      aiChatHistorySessionLimit: 200,
      aiChatOpenMode: 'sidecar',
      kubectlEnabled: true,
      kubectlImage: 'docker.cnb.cool/znb/images/kubectl:latest',
      nodeTerminalImage: 'docker.cnb.cool/znb/images/busybox:latest',
      enableAnalytics: false,
      enableVersionCheck: true,
      updateSource: 'auto',
    })

    renderComponent()

    await user.click(screen.getByRole('switch', { name: 'Enable analytics' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateGeneralSetting).toHaveBeenCalledWith(
        expect.objectContaining({ enableAnalytics: false })
      )
    })
    await waitFor(() => {
      expect(reloadSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('does not reload when analytics setting is unchanged', async () => {
    const user = userEvent.setup()
    const reloadSpy = vi
      .spyOn(GeneralManagementModule.browserRuntime, 'reloadWindow')
      .mockImplementation(() => undefined)

    updateGeneralSetting.mockResolvedValue({
      aiAgentEnabled: false,
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
      aiApiKey: '',
      aiApiKeyConfigured: false,
      aiBaseUrl: '',
      aiMaxTokens: 8192,
      aiChatHistorySessionLimit: 200,
      aiChatOpenMode: 'sidecar',
      kubectlEnabled: true,
      kubectlImage: 'docker.cnb.cool/znb/images/kubectl:latest',
      nodeTerminalImage: 'docker.cnb.cool/znb/images/busybox:latest',
      enableAnalytics: true,
      enableVersionCheck: true,
      updateSource: 'auto',
    })

    renderComponent()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateGeneralSetting).toHaveBeenCalledWith(
        expect.objectContaining({ enableAnalytics: true })
      )
    })
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(successToast).toHaveBeenCalled()
  })

  it('fetches provider models and allows selecting one into the model input', async () => {
    const user = userEvent.setup()

    renderComponent()

    await user.clear(screen.getByLabelText('Base URL'))
    await user.type(screen.getByLabelText('Base URL'), 'https://models.example')
    await user.click(screen.getByRole('button', { name: 'Fetch Models' }))

    await waitFor(() => {
      expect(fetchGeneralAIModels).toHaveBeenCalledWith({
        aiProvider: 'openai',
        aiBaseUrl: 'https://models.example',
      })
    })

    await user.click(await screen.findByText('claude-sonnet-4-5'))

    expect(screen.getByLabelText('Model')).toHaveValue('claude-sonnet-4-5')
  })

  it('tests the current AI configuration and reuses the stored API key when the input is blank', async () => {
    const user = userEvent.setup()

    renderComponent()

    await user.clear(screen.getByLabelText('Base URL'))
    await user.type(screen.getByLabelText('Base URL'), 'https://ai.example/v1')
    await user.clear(screen.getByLabelText('Model'))
    await user.type(screen.getByLabelText('Model'), 'gpt-4.1')
    await user.click(screen.getByRole('button', { name: 'Test Configuration' }))

    await waitFor(() => {
      expect(testGeneralAIConnection).toHaveBeenCalledWith({
        aiProvider: 'openai',
        aiBaseUrl: 'https://ai.example/v1',
        aiModel: 'gpt-4.1',
      })
    })

    expect(
      await screen.findByText('Connection test succeeded.')
    ).toBeInTheDocument()
    expect(screen.getByText('hello from test')).toBeInTheDocument()
  })
})

describe('shouldReloadForAnalyticsChange', () => {
  it('only reloads when the analytics toggle actually changes', () => {
    expect(
      GeneralManagementModule.shouldReloadForAnalyticsChange(true, false)
    ).toBe(true)
    expect(
      GeneralManagementModule.shouldReloadForAnalyticsChange(false, true)
    ).toBe(true)
    expect(
      GeneralManagementModule.shouldReloadForAnalyticsChange(true, true)
    ).toBe(false)
    expect(
      GeneralManagementModule.shouldReloadForAnalyticsChange(undefined, false)
    ).toBe(false)
  })
})
