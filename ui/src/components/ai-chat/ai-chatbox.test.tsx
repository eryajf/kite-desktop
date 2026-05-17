import '@/i18n'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

import { AIChatbox } from './ai-chatbox'

const { useAIChatContext } = vi.hoisted(() => ({
  useAIChatContext: vi.fn(),
}))

const { useAIChat } = vi.hoisted(() => ({
  useAIChat: vi.fn(),
}))

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}))

vi.mock('@/contexts/ai-chat-context', () => ({
  useAIChatContext,
}))

vi.mock('@/hooks/use-ai-chat', () => ({
  useAIChat,
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/lib/desktop', () => ({
  openURL: vi.fn(),
  copyTextToClipboard,
}))

describe('AIChatbox', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })

    useAIChatContext.mockReturnValue({
      isOpen: true,
      isAvailable: true,
      openChat: vi.fn(),
      closeChat: vi.fn(),
      pageContext: {
        page: 'overview',
        namespace: '',
        resourceName: '',
        resourceKind: '',
      },
    })

    useAIChat.mockReturnValue({
      messages: [],
      isLoading: false,
      history: [],
      currentSessionId: null,
      sendMessage: vi.fn(),
      executeAction: vi.fn(),
      submitInput: vi.fn(),
      denyAction: vi.fn(),
      stopGeneration: vi.fn(),
      loadSession: vi.fn(),
      deleteSession: vi.fn(),
      newSession: vi.fn(),
      ensureSessionId: vi.fn(() => 'session-1'),
      saveCurrentSession: vi.fn(() => 'session-1'),
    })

    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('updates visible ai chat copy when the language changes', async () => {
    render(
      <MemoryRouter initialEntries={['/ai-chat-box']}>
        <AIChatbox standalone />
      </MemoryRouter>
    )

    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Ask about your cluster...')
    ).toBeInTheDocument()
    expect(screen.getByText('Start with a focused check')).toBeInTheDocument()

    await act(async () => {
      await i18n.changeLanguage('zh')
    })

    expect(screen.getByText('AI 助手')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('询问当前集群...')).toBeInTheDocument()
    expect(screen.getByText('从一个明确的检查开始')).toBeInTheDocument()
  })

  it('updates visible ai chat copy when another window changes the language', async () => {
    render(
      <MemoryRouter initialEntries={['/ai-chat-box']}>
        <AIChatbox standalone />
      </MemoryRouter>
    )

    expect(screen.getByText('AI Assistant')).toBeInTheDocument()

    act(() => {
      localStorage.setItem('i18nextLng', 'zh')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'i18nextLng',
          newValue: 'zh',
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByText('AI 助手')).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText('询问当前集群...')).toBeInTheDocument()
  })

  it('keeps the composer editable while a reply is loading but blocks sending', () => {
    const sendMessage = vi.fn()
    useAIChat.mockReturnValue({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Working on it...',
        },
      ],
      isLoading: true,
      history: [],
      currentSessionId: null,
      sendMessage,
      executeAction: vi.fn(),
      submitInput: vi.fn(),
      denyAction: vi.fn(),
      stopGeneration: vi.fn(),
      loadSession: vi.fn(),
      deleteSession: vi.fn(),
      newSession: vi.fn(),
      ensureSessionId: vi.fn(() => 'session-1'),
      saveCurrentSession: vi.fn(() => 'session-1'),
    })

    render(
      <MemoryRouter initialEntries={['/ai-chat-box']}>
        <AIChatbox standalone />
      </MemoryRouter>
    )

    const composer = screen.getByPlaceholderText('Ask about your cluster...')
    expect(composer).not.toBeDisabled()

    fireEvent.change(composer, { target: { value: 'next question' } })
    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(composer).toHaveValue('next question')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('copies markdown code blocks from assistant messages', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    useAIChat.mockReturnValue({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Try this:\n\n```bash\nkubectl get pods\n```',
        },
      ],
      isLoading: false,
      history: [],
      currentSessionId: null,
      sendMessage: vi.fn(),
      executeAction: vi.fn(),
      submitInput: vi.fn(),
      denyAction: vi.fn(),
      stopGeneration: vi.fn(),
      loadSession: vi.fn(),
      deleteSession: vi.fn(),
      newSession: vi.fn(),
      ensureSessionId: vi.fn(() => 'session-1'),
      saveCurrentSession: vi.fn(() => 'session-1'),
    })

    render(
      <MemoryRouter initialEntries={['/ai-chat-box']}>
        <AIChatbox standalone />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    await waitFor(() => {
      expect(copyTextToClipboard).toHaveBeenCalledWith('kubectl get pods')
    })
  })
})
