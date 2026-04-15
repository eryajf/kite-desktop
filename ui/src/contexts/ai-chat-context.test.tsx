import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_CHAT_TOGGLE_EVENT } from '@/components/ai-chat/constants'

import { AIChatProvider, useAIChatContext } from './ai-chat-context'

const {
  useAIStatus,
  useGeneralSetting,
  toggleAIChatSidecar,
  openAIChatSidecar,
  closeAIChatSidecar,
} = vi.hoisted(() => ({
  useAIStatus: vi.fn(),
  useGeneralSetting: vi.fn(),
  toggleAIChatSidecar: vi.fn().mockResolvedValue(true),
  openAIChatSidecar: vi.fn().mockResolvedValue(true),
  closeAIChatSidecar: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/api', () => ({
  useAIStatus,
  useGeneralSetting,
}))

vi.mock('@/contexts/runtime-context', () => ({
  useRuntime: vi.fn(() => ({
    isDesktop: true,
    isReady: true,
  })),
}))

vi.mock('@/lib/desktop', () => ({
  toggleAIChatSidecar,
  openAIChatSidecar,
  closeAIChatSidecar,
}))

function AIChatStateProbe() {
  const { isAvailable, isOpen, pageContext } = useAIChatContext()

  return (
    <div>
      <span data-testid="available">{String(isAvailable)}</span>
      <span data-testid="state">{isOpen ? 'open' : 'closed'}</span>
      <span data-testid="page">{pageContext.page}</span>
      <span data-testid="resource">{pageContext.resourceName}</span>
    </div>
  )
}

function renderProvider(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <AIChatProvider>
              <AIChatStateProbe />
            </AIChatProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('AIChatProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('current-cluster', 'cluster-a')
    useAIStatus.mockReturnValue({
      data: { enabled: true },
    })
    useGeneralSetting.mockReturnValue({
      data: { aiChatOpenMode: 'overlay' },
    })
  })

  it('toggles AI chat from the keyboard shortcut and desktop event when enabled', async () => {
    renderProvider('/pods')

    expect(screen.getByTestId('available')).toHaveTextContent('true')
    expect(screen.getByTestId('state')).toHaveTextContent('closed')

    fireEvent.keyDown(document, { key: 'A', ctrlKey: true, shiftKey: true })

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('open')
    })

    fireEvent.keyDown(document, { key: 'A', ctrlKey: true, shiftKey: true })

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('closed')
    })

    fireEvent(window, new Event(AI_CHAT_TOGGLE_EVENT))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('open')
    })

    fireEvent(window, new Event(AI_CHAT_TOGGLE_EVENT))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('closed')
    })
  })

  it('does not expose the shortcut on unavailable pages or when AI is disabled', async () => {
    useAIStatus.mockReturnValueOnce({
      data: { enabled: false },
    })
    const { unmount } = renderProvider('/pods')

    expect(screen.getByTestId('available')).toHaveTextContent('false')
    fireEvent.keyDown(document, { key: 'A', ctrlKey: true, shiftKey: true })

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('closed')
    })

    unmount()

    renderProvider('/settings')

    expect(screen.getByTestId('available')).toHaveTextContent('false')
    fireEvent(window, new Event(AI_CHAT_TOGGLE_EVENT))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('closed')
    })
  })

  it('routes keyboard and desktop toggle events to sidecar mode on desktop', async () => {
    useGeneralSetting.mockReturnValueOnce({
      data: { aiChatOpenMode: 'sidecar' },
    })

    renderProvider('/pods/default/nginx')

    fireEvent.keyDown(document, { key: 'A', ctrlKey: true, shiftKey: true })

    await waitFor(() => {
      expect(toggleAIChatSidecar).toHaveBeenCalledWith({
        pageContext: {
          page: 'overview',
          namespace: '',
          resourceName: '',
          resourceKind: '',
        },
      })
    })

    expect(screen.getByTestId('state')).toHaveTextContent('closed')

    fireEvent(window, new Event(AI_CHAT_TOGGLE_EVENT))

    await waitFor(() => {
      expect(toggleAIChatSidecar).toHaveBeenCalledTimes(2)
    })
  })

  it('handles the shortcut inside standalone ai chat page when sidecar mode is enabled', async () => {
    useGeneralSetting.mockReturnValue({
      data: { aiChatOpenMode: 'sidecar' },
    })

    renderProvider('/ai-chat-box?page=overview')

    fireEvent.keyDown(document, { key: 'A', ctrlKey: true, shiftKey: true })

    await waitFor(() => {
      expect(toggleAIChatSidecar).toHaveBeenCalledWith({
        pageContext: {
          page: 'overview',
          namespace: '',
          resourceName: '',
          resourceKind: '',
        },
      })
    })
  })

  it('updates standalone sidecar page context when main window context changes', async () => {
    useGeneralSetting.mockReturnValue({
      data: { aiChatOpenMode: 'sidecar' },
    })

    localStorage.setItem(
      'ai-chat-sidecar-page-context-cluster-a',
      JSON.stringify({
        page: 'deployment-detail',
        namespace: 'default',
        resourceName: 'nginx',
        resourceKind: 'deployment',
      })
    )

    renderProvider('/ai-chat-box?page=overview')

    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('deployment-detail')
      expect(screen.getByTestId('resource')).toHaveTextContent('nginx')
    })

    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'ai-chat-sidecar-page-context-cluster-a',
        newValue: JSON.stringify({
          page: 'pod-detail',
          namespace: 'default',
          resourceName: 'api-server',
          resourceKind: 'pod',
        }),
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('pod-detail')
      expect(screen.getByTestId('resource')).toHaveTextContent('api-server')
    })
  })
})
