import { createContext, ReactNode, useContext, useMemo, useState } from 'react'
import type { Container, Pod } from 'kubernetes-types/core/v1'

import { trackEvent } from '@/lib/analytics'
import { getCurrentAnalyticsPageKey } from '@/lib/analytics-route'

export type TerminalSessionType = 'node' | 'pod' | 'kubectl'

export interface TerminalSessionSpec {
  type: TerminalSessionType
  title?: string
  subtitle?: string
  clusterName?: string
  namespace?: string
  podName?: string
  nodeName?: string
  containerName?: string
  pods?: Pod[]
  containers?: Container[]
  initContainers?: Container[]
  source?: string
  entry?: string
}

export interface TerminalSession extends TerminalSessionSpec {
  id: string
  title: string
  clusterName: string
  createdAt: number
}

interface TerminalContextType {
  isOpen: boolean
  isMinimized: boolean
  sessions: TerminalSession[]
  activeSessionId: string | null
  openTerminal: (entry?: string) => void
  restoreTerminal: () => void
  openSession: (spec: TerminalSessionSpec) => string
  activateSession: (sessionId: string) => void
  closeSession: (sessionId: string) => void
  closeTerminal: () => void
  minimizeTerminal: () => void
  toggleTerminal: (entry?: string) => void
}

const TerminalContext = createContext<TerminalContextType | undefined>(
  undefined
)

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const isOpen = sessions.length > 0

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )

  const openSession = (spec: TerminalSessionSpec) => {
    const session = createTerminalSession(spec)
    const alreadyExists = sessions.some((item) => item.id === session.id)

    setSessions((current) => {
      const existing = current.find((item) => item.id === session.id)
      if (existing) {
        return current
      }
      return [...current, session]
    })
    setActiveSessionId(session.id)
    setIsMinimized(false)

    if (!alreadyExists) {
      const eventProperties = {
        runtime: 'desktop',
        entry: spec.entry ?? 'resource',
        page: getCurrentAnalyticsPageKey(),
        type: session.type,
        ...(spec.source ? { source: spec.source } : {}),
      }

      trackEvent(
        session.type === 'kubectl'
          ? 'kubectl_terminal_open'
          : 'resource_terminal_open',
        eventProperties
      )
    }

    return session.id
  }

  // Open (or un-minimize) the default kubectl terminal.
  const openTerminal = (entry: string = 'button') => {
    openSession({
      type: 'kubectl',
      title: 'kubectl',
      entry,
      source: 'global',
    })
  }

  const activateSession = (sessionId: string) => {
    setActiveSessionId(sessionId)
    setIsMinimized(false)
  }

  const restoreTerminal = () => {
    if (isOpen) {
      setIsMinimized(false)
    }
  }

  const closeSession = (sessionId: string) => {
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId)
      if (activeSessionId === sessionId) {
        setActiveSessionId(next[next.length - 1]?.id ?? null)
      }
      if (next.length === 0) {
        setIsMinimized(false)
      }
      return next
    })
  }

  // Fully close and destroy all terminal sessions.
  const closeTerminal = () => {
    setSessions([])
    setActiveSessionId(null)
    setIsMinimized(false)
  }

  // Hide the panel but keep the session alive
  const minimizeTerminal = () => {
    setIsMinimized(true)
  }

  // Toggle open/minimized
  const toggleTerminal = (entry: string = 'button') => {
    if (!isOpen) {
      openTerminal(entry)
    } else if (isMinimized) {
      setIsMinimized(false)
    } else {
      minimizeTerminal()
    }
  }

  return (
    <TerminalContext.Provider
      value={{
        isOpen,
        isMinimized,
        sessions,
        activeSessionId: activeSession?.id ?? null,
        openTerminal,
        restoreTerminal,
        openSession,
        activateSession,
        closeSession,
        closeTerminal,
        minimizeTerminal,
        toggleTerminal,
      }}
    >
      {children}
    </TerminalContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTerminal() {
  const context = useContext(TerminalContext)
  if (context === undefined) {
    throw new Error('useTerminal must be used within a TerminalProvider')
  }
  return context
}

function createTerminalSession(spec: TerminalSessionSpec): TerminalSession {
  const clusterName =
    spec.clusterName ?? localStorage.getItem('current-cluster') ?? 'default'
  const id = createTerminalSessionId(spec, clusterName)
  return {
    ...spec,
    id,
    title: spec.title ?? createTerminalTitle(spec),
    clusterName,
    createdAt: Date.now(),
  }
}

function createTerminalSessionId(
  spec: TerminalSessionSpec,
  clusterName: string
) {
  return [
    clusterName,
    spec.type,
    spec.namespace ?? '',
    spec.podName ?? '',
    spec.nodeName ?? '',
    spec.containerName ?? '',
  ].join(':')
}

function createTerminalTitle(spec: TerminalSessionSpec) {
  if (spec.type === 'kubectl') {
    return 'kubectl'
  }

  if (spec.type === 'node') {
    return spec.nodeName ?? 'Node terminal'
  }

  const containerSuffix = spec.containerName ? ` · ${spec.containerName}` : ''
  return `${spec.podName ?? 'Pod'}${containerSuffix}`
}
