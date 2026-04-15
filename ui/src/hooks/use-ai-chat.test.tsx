import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAIChat } from './use-ai-chat'

const {
  listChatSessions,
  getChatSession,
  upsertChatSession,
  deleteChatSession,
} = vi.hoisted(() => ({
  listChatSessions: vi.fn(),
  getChatSession: vi.fn(),
  upsertChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
}))

vi.mock('@/lib/api/ai-history', () => ({
  listChatSessions,
  getChatSession,
  upsertChatSession,
  deleteChatSession,
}))

describe('useAIChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('current-cluster', 'cluster-a')
    listChatSessions.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 50,
    })
    upsertChatSession.mockResolvedValue({
      sessionId: 'session-1',
      title: 'Check rollout',
      clusterName: 'cluster-a',
      pageContext: {
        page: 'deployment-detail',
        namespace: 'default',
        resourceName: 'nginx',
        resourceKind: 'deployment',
      },
      messageCount: 1,
      createdAt: '2026-04-13T00:00:00Z',
      updatedAt: '2026-04-13T00:00:00Z',
      lastMessageAt: '2026-04-13T00:00:00Z',
    })
    getChatSession.mockResolvedValue({
      sessionId: 'session-1',
      title: 'Check rollout',
      clusterName: 'cluster-a',
      pageContext: {
        page: 'deployment-detail',
        namespace: 'default',
        resourceName: 'nginx',
        resourceKind: 'deployment',
      },
      messageCount: 1,
      createdAt: '2026-04-13T00:00:00Z',
      updatedAt: '2026-04-13T00:00:00Z',
      lastMessageAt: '2026-04-13T00:00:00Z',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Check rollout',
        },
      ],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    )
  })

  it('loads history from backend on mount', async () => {
    listChatSessions.mockResolvedValueOnce({
      data: [
        {
          sessionId: 'session-1',
          title: 'Check rollout',
          clusterName: 'cluster-a',
          pageContext: {
            page: 'deployment-detail',
            namespace: 'default',
            resourceName: 'nginx',
            resourceKind: 'deployment',
          },
          messageCount: 2,
          createdAt: '2026-04-13T00:00:00Z',
          updatedAt: '2026-04-13T00:05:00Z',
          lastMessageAt: '2026-04-13T00:05:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const { result } = renderHook(() => useAIChat())

    await waitFor(() => {
      expect(result.current.history).toHaveLength(1)
    })

    expect(result.current.history[0]).toMatchObject({
      id: 'session-1',
      title: 'Check rollout',
      messageCount: 2,
      clusterName: 'cluster-a',
    })
    expect(listChatSessions).toHaveBeenCalledWith(1, 50)
  })

  it('migrates legacy localStorage history once when backend is empty', async () => {
    localStorage.setItem(
      'ai-chat-history-desktop',
      JSON.stringify([
        {
          id: 'legacy-1',
          title: 'Legacy Session',
          createdAt: 1712966400000,
          updatedAt: 1712966400000,
          clusterName: 'cluster-a',
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'legacy question',
            },
          ],
          pageContext: {
            page: 'overview',
            namespace: '',
            resourceName: '',
            resourceKind: '',
          },
        },
      ])
    )

    listChatSessions
      .mockResolvedValueOnce({
        data: [],
        total: 0,
        page: 1,
        pageSize: 50,
      })
      .mockResolvedValueOnce({
        data: [
          {
            sessionId: 'legacy-1',
            title: 'Legacy Session',
            clusterName: 'cluster-a',
            pageContext: {
              page: 'overview',
              namespace: '',
              resourceName: '',
              resourceKind: '',
            },
            messageCount: 1,
            createdAt: '2026-04-13T00:00:00Z',
            updatedAt: '2026-04-13T00:00:00Z',
            lastMessageAt: '2026-04-13T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      })

    const { result } = renderHook(() => useAIChat())

    await waitFor(() => {
      expect(upsertChatSession).toHaveBeenCalledWith(
        'legacy-1',
        expect.objectContaining({
          title: 'Legacy Session',
        })
      )
    })

    await waitFor(() => {
      expect(result.current.history).toHaveLength(1)
    })

    expect(localStorage.getItem('ai-chat-history-migrated-v1-cluster-a')).toBe(
      'true'
    )
  })

  it('persists session snapshots through backend APIs when sending a message', async () => {
    const { result } = renderHook(() => useAIChat())

    await waitFor(() => {
      expect(listChatSessions).toHaveBeenCalled()
    })

    await act(async () => {
      await result.current.sendMessage(
        'Check rollout status',
        {
          page: 'deployment-detail',
          namespace: 'default',
          resourceName: 'nginx',
          resourceKind: 'deployment',
        },
        'en'
      )
    })

    await waitFor(() => {
      expect(upsertChatSession).toHaveBeenCalled()
    })

    const firstCall = upsertChatSession.mock.calls[0]
    expect(firstCall[1]).toMatchObject({
      pageContext: {
        page: 'deployment-detail',
        namespace: 'default',
        resourceName: 'nginx',
        resourceKind: 'deployment',
      },
    })
    expect(firstCall[1].messages[0]).toMatchObject({
      role: 'user',
      content: 'Check rollout status',
    })
    expect(localStorage.getItem('ai-chat-active-session-cluster-a')).toBeTruthy()
  })

  it('restores the last active session from storage after history loads', async () => {
    localStorage.setItem('ai-chat-active-session-cluster-a', 'session-1')
    listChatSessions.mockResolvedValueOnce({
      data: [
        {
          sessionId: 'session-1',
          title: 'Check rollout',
          clusterName: 'cluster-a',
          pageContext: {
            page: 'deployment-detail',
            namespace: 'default',
            resourceName: 'nginx',
            resourceKind: 'deployment',
          },
          messageCount: 1,
          createdAt: '2026-04-13T00:00:00Z',
          updatedAt: '2026-04-13T00:05:00Z',
          lastMessageAt: '2026-04-13T00:05:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const { result } = renderHook(() => useAIChat())

    await waitFor(() => {
      expect(getChatSession).toHaveBeenCalledWith('session-1')
    })

    await waitFor(() => {
      expect(result.current.currentSessionId).toBe('session-1')
      expect(result.current.messages).toHaveLength(1)
    })
  })

  it('clears the active session when starting a new chat', async () => {
    localStorage.setItem('ai-chat-active-session-cluster-a', 'session-1')

    const { result } = renderHook(() => useAIChat())

    await waitFor(() => {
      expect(listChatSessions).toHaveBeenCalled()
    })

    act(() => {
      result.current.newSession()
    })

    expect(localStorage.getItem('ai-chat-active-session-cluster-a')).toBeNull()
    expect(result.current.currentSessionId).toBeNull()
    expect(result.current.messages).toHaveLength(0)
  })
})
