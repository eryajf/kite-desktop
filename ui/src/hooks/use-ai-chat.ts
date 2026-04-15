import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AIChatMessagePayload,
  AIChatPageContextPayload,
  AIChatSessionDetailPayload,
  AIChatSessionSummaryPayload,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  upsertChatSession,
} from '@/lib/api/ai-history'
import { withSubPath } from '@/lib/subpath'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string
  toolCallId?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  inputRequest?: {
    sessionId: string
    kind: 'choice' | 'form'
    name?: string
    title: string
    description?: string
    submitLabel?: string
    options?: Array<{
      label: string
      value: string
      description?: string
    }>
    fields?: Array<{
      name: string
      label: string
      type: 'text' | 'number' | 'textarea' | 'select' | 'switch'
      required?: boolean
      placeholder?: string
      description?: string
      defaultValue?: string
      options?: Array<{
        label: string
        value: string
        description?: string
      }>
    }>
  }
  pendingAction?: {
    sessionId: string
    tool: string
    args: Record<string, unknown>
  }
  actionStatus?: 'pending' | 'confirmed' | 'denied' | 'error'
}

export interface PageContext {
  page: string
  namespace: string
  resourceName: string
  resourceKind: string
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  clusterName?: string
  messageCount: number
  pageContext?: PageContext
  messages?: ChatMessage[]
}

type APIChatMessage = { role: 'user' | 'assistant'; content: string }

const HISTORY_STORAGE_KEY_PREFIX = 'ai-chat-history-'
const LEGACY_HISTORY_STORAGE_KEY = `${HISTORY_STORAGE_KEY_PREFIX}desktop`
const HISTORY_MIGRATION_STORAGE_KEY_PREFIX = 'ai-chat-history-migrated-v1-'
const ACTIVE_SESSION_STORAGE_KEY_PREFIX = 'ai-chat-active-session-'
const MAX_HISTORY_SESSIONS = 50

function loadLegacyHistoryFromStorage(): ChatSession[] {
  try {
    const stored = localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

function getMigrationStorageKey(clusterName: string) {
  return `${HISTORY_MIGRATION_STORAGE_KEY_PREFIX}${clusterName || 'default'}`
}

function getActiveSessionStorageKey(clusterName: string) {
  return `${ACTIVE_SESSION_STORAGE_KEY_PREFIX}${clusterName || 'default'}`
}

function loadActiveSessionId(clusterName: string) {
  return localStorage.getItem(getActiveSessionStorageKey(clusterName)) || ''
}

function persistActiveSessionId(clusterName: string, sessionId: string) {
  if (!sessionId) return
  localStorage.setItem(getActiveSessionStorageKey(clusterName), sessionId)
}

function clearActiveSessionId(clusterName: string) {
  localStorage.removeItem(getActiveSessionStorageKey(clusterName))
}

function hasLegacyHistoryMigrated(clusterName: string) {
  return localStorage.getItem(getMigrationStorageKey(clusterName)) === 'true'
}

function markLegacyHistoryMigrated(clusterName: string) {
  localStorage.setItem(getMigrationStorageKey(clusterName), 'true')
}

// TODO: generate session title with AI to better summarize the conversation, instead of just using the first user message
function generateSessionTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (!firstUserMessage) return 'New Chat'
  const content = firstUserMessage.content.trim()
  return content.length > 50 ? content.slice(0, 50) + '...' : content
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Date.now() : parsed
}

function toPageContext(
  pageContext?: AIChatPageContextPayload | null
): PageContext | undefined {
  if (!pageContext) return undefined
  return {
    page: pageContext.page || '',
    namespace: pageContext.namespace || '',
    resourceName: pageContext.resourceName || '',
    resourceKind: pageContext.resourceKind || '',
  }
}

function toChatSession(
  session: AIChatSessionSummaryPayload | AIChatSessionDetailPayload
): ChatSession {
  return {
    id: session.sessionId,
    title: session.title,
    createdAt: parseTimestamp(session.createdAt),
    updatedAt: parseTimestamp(session.updatedAt),
    clusterName: session.clusterName || '',
    messageCount: session.messageCount,
    pageContext: toPageContext(session.pageContext),
    messages:
      'messages' in session
        ? session.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            thinking: message.thinking,
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            toolArgs: message.toolArgs,
            toolResult: message.toolResult,
            inputRequest: message.inputRequest as ChatMessage['inputRequest'],
            pendingAction:
              message.pendingAction as ChatMessage['pendingAction'],
            actionStatus: message.actionStatus,
          }))
        : undefined,
  }
}

function toAPIPageContext(pageContext: PageContext): AIChatPageContextPayload {
  return {
    page: pageContext.page,
    namespace: pageContext.namespace,
    resourceName: pageContext.resourceName,
    resourceKind: pageContext.resourceKind,
  }
}

function toAPIMessage(message: ChatMessage): AIChatMessagePayload {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    thinking: message.thinking,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    toolArgs: message.toolArgs,
    toolResult: message.toolResult,
    inputRequest: message.inputRequest as Record<string, unknown> | undefined,
    pendingAction: message.pendingAction as Record<string, unknown> | undefined,
    actionStatus: message.actionStatus,
  }
}

export function useAIChat() {
  const currentCluster = localStorage.getItem('current-cluster') || ''

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [history, setHistory] = useState<ChatSession[]>([])
  const messagesRef = useRef<ChatMessage[]>([])
  const currentSessionIdRef = useRef<string | null>(null)
  const lastPageContextRef = useRef<PageContext>({
    page: 'overview',
    namespace: '',
    resourceName: '',
    resourceKind: '',
  })
  const abortControllerRef = useRef<AbortController | null>(null)
  const activeAssistantMsgIdRef = useRef<string | null>(null)
  const startNewAssistantSegmentRef = useRef(false)
  const didAttemptRestoreRef = useRef(false)

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId
  }, [currentSessionId])

  const generateId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const replaceMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const updateMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev)
        messagesRef.current = next
        return next
      })
    },
    []
  )

  const mergeHistorySession = useCallback((session: ChatSession) => {
    setHistory((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === session.id)
      let updated = [...prev]
      if (existingIndex >= 0) {
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...session,
          createdAt: updated[existingIndex].createdAt || session.createdAt,
        }
      } else {
        updated = [session, ...updated]
      }

      updated.sort((a, b) => b.updatedAt - a.updatedAt)
      if (updated.length > MAX_HISTORY_SESSIONS) {
        updated = updated.slice(0, MAX_HISTORY_SESSIONS)
      }
      return updated
    })
  }, [])

  const upsertHistorySummary = useCallback(
    (
      sessionId: string,
      sessionMessages: ChatMessage[],
      pageContext: PageContext,
      createdAt?: number
    ) => {
      if (!sessionId || sessionMessages.length === 0) return

      const now = Date.now()
      mergeHistorySession({
        id: sessionId,
        title: generateSessionTitle(sessionMessages),
        createdAt: createdAt || now,
        updatedAt: now,
        clusterName: localStorage.getItem('current-cluster') || '',
        messageCount: sessionMessages.length,
        pageContext,
      })
    },
    [mergeHistorySession]
  )

  const persistSessionSnapshot = useCallback(
    async (
      sessionId: string,
      sessionMessages: ChatMessage[],
      pageContext: PageContext
    ) => {
      if (!sessionId || sessionMessages.length === 0) return null

      upsertHistorySummary(sessionId, sessionMessages, pageContext)

      try {
        const savedSession = await upsertChatSession(sessionId, {
          title: generateSessionTitle(sessionMessages),
          pageContext: toAPIPageContext(pageContext),
          messages: sessionMessages.map(toAPIMessage),
        })
        const mapped = toChatSession(savedSession)
        mergeHistorySession(mapped)
        return mapped
      } catch (error) {
        console.error('Failed to persist AI chat session:', error)
        return null
      }
    },
    [mergeHistorySession, upsertHistorySummary]
  )

  const reloadHistory = useCallback(async () => {
    const response = await listChatSessions(1, MAX_HISTORY_SESSIONS)
    const sessions = response.data.map(toChatSession)
    setHistory(sessions)
    return sessions
  }, [])

  const migrateLegacyHistory = useCallback(async () => {
    const clusterName = localStorage.getItem('current-cluster') || ''
    if (hasLegacyHistoryMigrated(clusterName)) {
      return false
    }

    const legacySessions = loadLegacyHistoryFromStorage().filter((session) => {
      if (!session.messages?.length) return false
      return !session.clusterName || session.clusterName === clusterName
    })

    if (legacySessions.length === 0) {
      markLegacyHistoryMigrated(clusterName)
      return false
    }

    for (const session of legacySessions) {
      await upsertChatSession(session.id, {
        title: session.title,
        pageContext: toAPIPageContext(
          session.pageContext || lastPageContextRef.current
        ),
        messages: (session.messages || []).map(toAPIMessage),
      })
    }

    markLegacyHistoryMigrated(clusterName)
    return true
  }, [])

  useEffect(() => {
    let cancelled = false
    didAttemptRestoreRef.current = false

    const loadHistory = async () => {
      try {
        const sessions = await reloadHistory()
        if (cancelled) return

        if (sessions.length === 0) {
          const migrated = await migrateLegacyHistory()
          if (!cancelled && migrated) {
            await reloadHistory()
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load AI chat history:', error)
        }
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [currentCluster, migrateLegacyHistory, reloadHistory])

  const ensureSessionId = useCallback(() => {
    if (currentSessionId) return currentSessionId
    const sessionId = generateId()
    setCurrentSessionId(sessionId)
    currentSessionIdRef.current = sessionId
    return sessionId
  }, [currentSessionId])

  const saveCurrentSession = useCallback(
    (sessionId?: string | null, pageContext?: PageContext) => {
      if (messagesRef.current.length === 0) return null

      const resolvedSessionId =
        sessionId ||
        currentSessionIdRef.current ||
        currentSessionId ||
        generateId()
      const resolvedPageContext = pageContext || lastPageContextRef.current
      void persistSessionSnapshot(
        resolvedSessionId,
        messagesRef.current,
        resolvedPageContext
      )
      persistActiveSessionId(currentCluster, resolvedSessionId)
      if (currentSessionId !== resolvedSessionId) {
        setCurrentSessionId(resolvedSessionId)
        currentSessionIdRef.current = resolvedSessionId
      }
      return resolvedSessionId
    },
    [currentCluster, currentSessionId, persistSessionSnapshot]
  )

  const appendAssistantError = useCallback(
    (message: string) => {
      updateMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${message}`,
        },
      ])
    },
    [updateMessages]
  )

  const updateToolMessage = useCallback(
    (
      toolCallId: string | undefined,
      tool: string,
      updater: (message: ChatMessage) => ChatMessage
    ) => {
      updateMessages((prev) => {
        let targetIndex = -1

        if (toolCallId) {
          targetIndex = prev.findIndex(
            (m) => m.role === 'tool' && m.toolCallId === toolCallId
          )
        }

        if (targetIndex < 0) {
          const index = [...prev]
            .reverse()
            .findIndex((m) => m.role === 'tool' && m.toolName === tool)
          if (index < 0) {
            return prev
          }
          targetIndex = prev.length - 1 - index
        }

        return prev.map((m, i) => (i === targetIndex ? updater(m) : m))
      })
    },
    [updateMessages]
  )

  const handleSSEEvent = useCallback(
    (eventType: string, data: Record<string, unknown>) => {
      switch (eventType) {
        case 'message': {
          const content = (data as { content: string }).content
          if (typeof content !== 'string') {
            break
          }
          if (
            startNewAssistantSegmentRef.current ||
            !activeAssistantMsgIdRef.current
          ) {
            activeAssistantMsgIdRef.current = generateId()
            startNewAssistantSegmentRef.current = false
          }
          const assistantMsgId = activeAssistantMsgIdRef.current
          if (!assistantMsgId) {
            break
          }

          updateMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantMsgId)
            if (existing) {
              return prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: `${m.content}${content}` }
                  : m
              )
            }
            return [
              ...prev,
              {
                id: assistantMsgId,
                role: 'assistant' as const,
                content,
                thinking: '',
              },
            ]
          })
          break
        }
        case 'think': {
          const thinking = (data as { content: string }).content
          if (typeof thinking !== 'string') {
            break
          }
          if (
            startNewAssistantSegmentRef.current ||
            !activeAssistantMsgIdRef.current
          ) {
            activeAssistantMsgIdRef.current = generateId()
            startNewAssistantSegmentRef.current = false
          }
          const assistantMsgId = activeAssistantMsgIdRef.current
          if (!assistantMsgId) {
            break
          }

          updateMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantMsgId)
            if (existing) {
              return prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, thinking: `${m.thinking || ''}${thinking}` }
                  : m
              )
            }
            return [
              ...prev,
              {
                id: assistantMsgId,
                role: 'assistant' as const,
                content: '',
                thinking,
              },
            ]
          })
          break
        }
        case 'tool_call': {
          const { tool, tool_call_id, args } = data as {
            tool: string
            tool_call_id?: string
            args: Record<string, unknown>
          }
          startNewAssistantSegmentRef.current = true
          updateMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'tool' as const,
              content: `Calling ${tool}...`,
              toolCallId:
                typeof tool_call_id === 'string' ? tool_call_id : undefined,
              toolName: tool,
              toolArgs: args,
            },
          ])
          break
        }
        case 'tool_result': {
          const { tool, tool_call_id, result, is_error } = data as {
            tool: string
            tool_call_id?: string
            result: unknown
            is_error?: boolean
          }
          const toolResult =
            typeof result === 'string' ? result : JSON.stringify(result ?? '')
          const inferredError =
            typeof is_error === 'boolean'
              ? is_error
              : /^(error:|forbidden:|tool error:)/i.test(toolResult.trim())
          updateToolMessage(tool_call_id, tool, (message) => ({
            ...message,
            content: `${tool} ${inferredError ? 'failed' : 'completed'}`,
            toolResult,
            actionStatus: inferredError ? 'error' : 'confirmed',
          }))
          break
        }
        case 'action_required': {
          const { tool, tool_call_id, args, session_id } = data as {
            tool: string
            tool_call_id?: string
            args: Record<string, unknown>
            session_id: string
          }
          if (!session_id) {
            appendAssistantError(
              `Missing session id for pending action ${tool}`
            )
            break
          }
          updateToolMessage(tool_call_id, tool, (message) => ({
            ...message,
            content: `${tool} requires confirmation`,
            pendingAction: { tool, args, sessionId: session_id },
            actionStatus: 'pending' as const,
          }))
          break
        }
        case 'input_required': {
          const {
            tool,
            tool_call_id,
            session_id,
            kind,
            name,
            title,
            description,
            submit_label,
            options,
            fields,
          } = data as {
            tool: string
            tool_call_id?: string
            session_id: string
            kind: string
            name?: string
            title?: string
            description?: string
            submit_label?: string
            options?: Array<{
              label: string
              value: string
              description?: string
            }>
            fields?: Array<{
              name: string
              label: string
              type: 'text' | 'number' | 'textarea' | 'select' | 'switch'
              required?: boolean
              placeholder?: string
              description?: string
              default_value?: string
              options?: Array<{
                label: string
                value: string
                description?: string
              }>
            }>
          }
          if (!session_id) {
            appendAssistantError(`Missing session id for input request ${tool}`)
            break
          }
          if (kind !== 'choice' && kind !== 'form') {
            appendAssistantError(`Unsupported input request type ${kind}`)
            break
          }

          updateToolMessage(tool_call_id, tool, (message) => ({
            ...message,
            content: `${tool} requires input`,
            inputRequest: {
              sessionId: session_id,
              kind,
              name:
                typeof name === 'string' && name.trim()
                  ? name.trim()
                  : undefined,
              title:
                typeof title === 'string' && title.trim() ? title.trim() : tool,
              description:
                typeof description === 'string' && description.trim()
                  ? description.trim()
                  : undefined,
              submitLabel:
                typeof submit_label === 'string' && submit_label.trim()
                  ? submit_label.trim()
                  : undefined,
              options: Array.isArray(options)
                ? options
                    .filter(
                      (option) =>
                        option != null &&
                        typeof option.label === 'string' &&
                        typeof option.value === 'string'
                    )
                    .map((option) => ({
                      label: option.label,
                      value: option.value,
                      description:
                        typeof option.description === 'string'
                          ? option.description
                          : undefined,
                    }))
                : undefined,
              fields: Array.isArray(fields)
                ? fields
                    .filter(
                      (field) =>
                        field != null &&
                        typeof field.name === 'string' &&
                        typeof field.label === 'string' &&
                        typeof field.type === 'string'
                    )
                    .map((field) => ({
                      name: field.name,
                      label: field.label,
                      type: field.type,
                      required: field.required === true,
                      placeholder:
                        typeof field.placeholder === 'string'
                          ? field.placeholder
                          : undefined,
                      description:
                        typeof field.description === 'string'
                          ? field.description
                          : undefined,
                      defaultValue:
                        typeof field.default_value === 'string'
                          ? field.default_value
                          : undefined,
                      options: Array.isArray(field.options)
                        ? field.options
                            .filter(
                              (option) =>
                                option != null &&
                                typeof option.label === 'string' &&
                                typeof option.value === 'string'
                            )
                            .map((option) => ({
                              label: option.label,
                              value: option.value,
                              description:
                                typeof option.description === 'string'
                                  ? option.description
                                  : undefined,
                            }))
                        : undefined,
                    }))
                : undefined,
            },
            actionStatus: 'pending' as const,
          }))
          break
        }
        case 'error': {
          const { message } = data as { message: string }
          appendAssistantError(message)
          break
        }
      }
    },
    [appendAssistantError, updateMessages, updateToolMessage]
  )

  const readSSEStream = useCallback(
    async (response: Response) => {
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let eventType = ''
      let eventDataLines: string[] = []
      let streamError: string | null = null

      const processLine = (line: string) => {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          eventDataLines.push(line.slice(6))
        } else if (line === '') {
          flushEvent()
        }
      }

      const flushEvent = () => {
        if (!eventType || eventDataLines.length === 0) {
          eventType = ''
          eventDataLines = []
          return
        }

        try {
          const data = JSON.parse(eventDataLines.join('\n'))
          if (
            eventType === 'error' &&
            streamError == null &&
            typeof data?.message === 'string' &&
            data.message.trim() !== ''
          ) {
            streamError = data.message
          }
          handleSSEEvent(eventType, data)
        } catch {
          // ignore invalid SSE payload
        }

        eventType = ''
        eventDataLines = []
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          processLine(line)
        }
      }

      buffer += decoder.decode()
      const remainingLines = buffer.split('\n')
      buffer = remainingLines.pop() || ''
      for (const line of remainingLines) {
        processLine(line)
      }

      if (buffer.trim() !== '') {
        processLine(buffer.trim())
      }
      flushEvent()
      return streamError
    },
    [handleSSEEvent]
  )

  const streamChat = useCallback(
    async (
      apiMessages: APIChatMessage[],
      pageContext: PageContext,
      language: string,
      abortSignal?: AbortSignal
    ) => {
      const clusterName = localStorage.getItem('current-cluster') || ''
      const requestLanguage = (language || '').trim() || 'en'

      const response = await fetch(withSubPath('/api/v1/ai/chat'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': requestLanguage,
          'x-cluster-name': clusterName,
        },
        body: JSON.stringify({
          messages: apiMessages,
          language: requestLanguage,
          page_context: {
            page: pageContext.page,
            namespace: pageContext.namespace,
            resource_name: pageContext.resourceName,
            resource_kind: pageContext.resourceKind,
          },
        }),
        signal: abortSignal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(
          errData.error || `HTTP error! status: ${response.status}`
        )
      }

      await readSSEStream(response)
    },
    [readSSEStream]
  )

  const buildAPIMessages = useCallback(
    (sourceMessages: ChatMessage[], extra: APIChatMessage[] = []) => {
      const history: APIChatMessage[] = []

      for (const m of sourceMessages) {
        if (m.role === 'user' || m.role === 'assistant') {
          history.push({ role: m.role, content: m.content })
        } else if (m.role === 'tool' && m.toolResult) {
          // Include tool results as assistant messages to preserve context
          const toolSummary = `[Tool: ${m.toolName}]\nResult: ${m.toolResult}`
          history.push({ role: 'assistant', content: toolSummary })
        }
      }

      return [...history, ...extra]
    },
    []
  )

  const sendMessage = useCallback(
    async (content: string, pageContext: PageContext, language: string) => {
      const trimmed = content.trim()
      if (!trimmed || isLoading) return

      lastPageContextRef.current = pageContext
      const sessionId = ensureSessionId()
      const requestLanguage = (language || '').trim() || 'en'
      const previousMessages = messagesRef.current
      const baseMessages = buildAPIMessages(previousMessages)
      const nextMessages = [
        ...previousMessages.map((message) =>
          message.inputRequest
            ? {
                ...message,
                actionStatus: 'denied' as const,
                inputRequest: undefined,
                content: `${message.toolName || 'input request'} cancelled`,
              }
            : message
        ),
        {
          id: generateId(),
          role: 'user' as const,
          content: trimmed,
        },
      ]

      replaceMessages(nextMessages)
      persistActiveSessionId(currentCluster, sessionId)
      void persistSessionSnapshot(sessionId, nextMessages, pageContext)
      setIsLoading(true)

      const apiMessages = [
        ...baseMessages,
        { role: 'user' as const, content: trimmed },
      ]

      activeAssistantMsgIdRef.current = generateId()
      startNewAssistantSegmentRef.current = false

      try {
        abortControllerRef.current = new AbortController()
        await streamChat(
          apiMessages,
          pageContext,
          requestLanguage,
          abortControllerRef.current.signal
        )
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          appendAssistantError((error as Error).message)
        }
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
        activeAssistantMsgIdRef.current = null
        startNewAssistantSegmentRef.current = false
        saveCurrentSession(sessionId, pageContext)
      }
    },
    [
      appendAssistantError,
      buildAPIMessages,
      ensureSessionId,
      isLoading,
      persistSessionSnapshot,
      replaceMessages,
      saveCurrentSession,
      streamChat,
      currentCluster,
    ]
  )

  const executeAction = useCallback(
    async (messageId: string) => {
      const msg = messagesRef.current.find((m) => m.id === messageId)
      if (!msg?.pendingAction) return

      const sessionId = msg.pendingAction.sessionId?.trim()
      if (!sessionId) {
        updateMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: 'error' as const,
                  pendingAction: undefined,
                  toolResult:
                    'This pending action has expired. Please ask the AI to generate the action again.',
                  content: `${msg.toolName} failed`,
                }
              : m
          )
        )
        return
      }

      const clusterName = localStorage.getItem('current-cluster') || ''

      try {
        updateMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: 'pending' as const,
                  pendingAction: undefined,
                  content: `${msg.toolName} executing`,
                }
              : m
          )
        )

        setIsLoading(true)
        try {
          activeAssistantMsgIdRef.current = generateId()
          startNewAssistantSegmentRef.current = false
          abortControllerRef.current = new AbortController()

          const response = await fetch(
            withSubPath('/api/v1/ai/execute/continue'),
            {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'x-cluster-name': clusterName,
              },
              body: JSON.stringify({ sessionId }),
              signal: abortControllerRef.current.signal,
            }
          )

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}))
            throw new Error(
              errData.error || `HTTP error! status: ${response.status}`
            )
          }

          const streamError = await readSSEStream(response)
          if (streamError) {
            updateMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      actionStatus: 'error' as const,
                      toolResult: streamError,
                      content: `${msg.toolName} failed`,
                    }
                  : m
              )
            )
          }
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            appendAssistantError((error as Error).message)
            updateMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      actionStatus: 'error' as const,
                      toolResult: (error as Error).message,
                      content: `${msg.toolName} failed`,
                    }
                  : m
              )
            )
          }
        } finally {
          setIsLoading(false)
          abortControllerRef.current = null
          activeAssistantMsgIdRef.current = null
          startNewAssistantSegmentRef.current = false
          saveCurrentSession()
        }
      } catch (error) {
        updateMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: 'error' as const,
                  toolResult: (error as Error).message,
                  content: `${msg.toolName} failed`,
                }
              : m
          )
        )
      }
    },
    [appendAssistantError, readSSEStream, saveCurrentSession, updateMessages]
  )

  const submitInput = useCallback(
    async (messageId: string, values: Record<string, unknown>) => {
      const msg = messagesRef.current.find((m) => m.id === messageId)
      if (!msg?.inputRequest) return

      const inputRequest = msg.inputRequest
      const sessionId = inputRequest.sessionId?.trim()
      if (!sessionId) {
        updateMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: 'error' as const,
                  inputRequest: undefined,
                  toolResult:
                    'This input request has expired. Please ask the AI again.',
                  content: `${msg.toolName} failed`,
                }
              : m
          )
        )
        return
      }

      const clusterName = localStorage.getItem('current-cluster') || ''

      try {
        updateMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: 'pending' as const,
                  inputRequest: undefined,
                  content: `${msg.toolName} submitting`,
                }
              : m
          )
        )

        setIsLoading(true)
        try {
          activeAssistantMsgIdRef.current = generateId()
          startNewAssistantSegmentRef.current = false
          abortControllerRef.current = new AbortController()

          const response = await fetch(
            withSubPath('/api/v1/ai/input/continue'),
            {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'x-cluster-name': clusterName,
              },
              body: JSON.stringify({ sessionId, values }),
              signal: abortControllerRef.current.signal,
            }
          )

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}))
            throw new Error(
              errData.error || `HTTP error! status: ${response.status}`
            )
          }

          const streamError = await readSSEStream(response)
          if (streamError) {
            updateMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      actionStatus: 'error' as const,
                      inputRequest,
                      toolResult: streamError,
                      content: `${msg.toolName} failed`,
                    }
                  : m
              )
            )
          }
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            appendAssistantError((error as Error).message)
            updateMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      actionStatus: 'error' as const,
                      inputRequest,
                      toolResult: (error as Error).message,
                      content: `${msg.toolName} failed`,
                    }
                  : m
              )
            )
          }
        } finally {
          setIsLoading(false)
          abortControllerRef.current = null
          activeAssistantMsgIdRef.current = null
          startNewAssistantSegmentRef.current = false
          saveCurrentSession()
        }
      } catch (error) {
        updateMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: 'error' as const,
                  inputRequest,
                  toolResult: (error as Error).message,
                  content: `${msg.toolName} failed`,
                }
              : m
          )
        )
      }
    },
    [appendAssistantError, readSSEStream, saveCurrentSession, updateMessages]
  )

  const denyAction = useCallback(
    (messageId: string) => {
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                actionStatus: 'denied' as const,
                pendingAction: undefined,
                inputRequest: undefined,
                content: `${m.toolName || 'request'} cancelled`,
              }
            : m
        )
      )
    },
    [updateMessages]
  )

  const clearMessages = useCallback(() => {
    messagesRef.current = []
    setMessages([])
    setCurrentSessionId(null)
    currentSessionIdRef.current = null
    clearActiveSessionId(currentCluster)
  }, [currentCluster])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsLoading(false)
  }, [])

  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        setIsLoading(true)
        const session = toChatSession(await getChatSession(sessionId))
        replaceMessages(session.messages || [])
        setCurrentSessionId(sessionId)
        currentSessionIdRef.current = sessionId
        persistActiveSessionId(currentCluster, sessionId)
        if (session.pageContext) {
          lastPageContextRef.current = session.pageContext
        }
        mergeHistorySession(session)
      } catch (error) {
        console.error('Failed to load AI chat session:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [currentCluster, mergeHistorySession, replaceMessages]
  )

  useEffect(() => {
    if (didAttemptRestoreRef.current) {
      return
    }
    if (currentSessionId || history.length === 0) {
      return
    }

    didAttemptRestoreRef.current = true
    const activeSessionId = loadActiveSessionId(currentCluster)
    if (!activeSessionId) {
      return
    }
    if (!history.some((session) => session.id === activeSessionId)) {
      clearActiveSessionId(currentCluster)
      return
    }

    void loadSession(activeSessionId)
  }, [currentCluster, currentSessionId, history, loadSession])

  const deleteSession = useCallback(
    (sessionId: string) => {
      const activeSessionId = loadActiveSessionId(currentCluster)
      let nextActiveSessionId = ''
      setHistory((prev) => {
        const next = prev.filter((session) => session.id !== sessionId)
        if (activeSessionId === sessionId) {
          nextActiveSessionId = next[0]?.id || ''
          if (nextActiveSessionId) {
            persistActiveSessionId(currentCluster, nextActiveSessionId)
          } else {
            clearActiveSessionId(currentCluster)
          }
        }
        return next
      })
      if (currentSessionId === sessionId) {
        messagesRef.current = []
        setMessages([])
        setCurrentSessionId(null)
        currentSessionIdRef.current = null
        if (nextActiveSessionId) {
          persistActiveSessionId(currentCluster, nextActiveSessionId)
        } else {
          clearActiveSessionId(currentCluster)
        }
      }

      void deleteChatSession(sessionId).catch((error) => {
        console.error('Failed to delete AI chat session:', error)
        void reloadHistory()
      })
    },
    [currentCluster, currentSessionId, reloadHistory]
  )

  const newSession = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  return {
    messages,
    isLoading,
    history,
    currentSessionId,
    sendMessage,
    executeAction,
    submitInput,
    denyAction,
    clearMessages,
    stopGeneration,
    loadSession,
    deleteSession,
    newSession,
    ensureSessionId,
    saveCurrentSession,
  }
}
