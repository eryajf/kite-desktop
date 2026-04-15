import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRuntime } from '@/contexts/runtime-context'
import { useLocation, useParams } from 'react-router-dom'

import { useAIStatus, useGeneralSetting } from '@/lib/api'
import {
  closeAIChatSidecar,
  openAIChatSidecar,
  toggleAIChatSidecar,
} from '@/lib/desktop'
import { AI_CHAT_TOGGLE_EVENT } from '@/components/ai-chat/constants'

interface PageContext {
  page: string
  namespace: string
  resourceName: string
  resourceKind: string
}

interface AIChatContextType {
  isOpen: boolean
  isAvailable: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  pageContext: PageContext
}

const AIChatContext = createContext<AIChatContextType | undefined>(undefined)
const AI_CHAT_SIDECAR_PAGE_CONTEXT_STORAGE_KEY_PREFIX =
  'ai-chat-sidecar-page-context-'

const singularResourceMap: Record<string, string> = {
  pods: 'pod',
  services: 'service',
  configmaps: 'configmap',
  secrets: 'secret',
  namespaces: 'namespace',
  nodes: 'node',
  persistentvolumeclaims: 'persistentvolumeclaim',
  persistentvolumes: 'persistentvolume',
  serviceaccounts: 'serviceaccount',
  deployments: 'deployment',
  statefulsets: 'statefulset',
  daemonsets: 'daemonset',
  replicasets: 'replicaset',
  jobs: 'job',
  cronjobs: 'cronjob',
  ingresses: 'ingress',
  networkpolicies: 'networkpolicy',
  storageclasses: 'storageclass',
  events: 'event',
}

function toSingularResource(resource: string) {
  if (!resource) return resource
  const normalized = resource.toLowerCase()
  if (singularResourceMap[normalized]) {
    return singularResourceMap[normalized]
  }
  if (normalized.endsWith('s')) {
    return normalized.slice(0, -1)
  }
  return normalized
}

function normalizePageContext(
  pageContext?: Partial<PageContext> | null
): PageContext {
  return {
    page: pageContext?.page || 'overview',
    namespace: pageContext?.namespace || '',
    resourceName: pageContext?.resourceName || '',
    resourceKind: toSingularResource(pageContext?.resourceKind || ''),
  }
}

function getAIChatSidecarPageContextStorageKey(clusterName: string) {
  return `${AI_CHAT_SIDECAR_PAGE_CONTEXT_STORAGE_KEY_PREFIX}${clusterName || 'default'}`
}

function parseAIChatSidecarPageContext(value: string): PageContext | null {
  try {
    return normalizePageContext(JSON.parse(value) as Partial<PageContext>)
  } catch {
    return null
  }
}

function loadAIChatSidecarPageContext(clusterName: string): PageContext | null {
  const stored = localStorage.getItem(
    getAIChatSidecarPageContextStorageKey(clusterName)
  )
  if (!stored) {
    return null
  }
  return parseAIChatSidecarPageContext(stored)
}

function persistAIChatSidecarPageContext(
  clusterName: string,
  pageContext: PageContext
) {
  localStorage.setItem(
    getAIChatSidecarPageContextStorageKey(clusterName),
    JSON.stringify(normalizePageContext(pageContext))
  )
}

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [syncedSidecarPageContext, setSyncedSidecarPageContext] =
    useState<PageContext>({
      page: 'overview',
      namespace: '',
      resourceName: '',
      resourceKind: '',
    })
  const location = useLocation()
  const params = useParams()
  const { isDesktop } = useRuntime()
  const currentCluster = localStorage.getItem('current-cluster') || ''
  const { data: { enabled: aiEnabled } = { enabled: false } } = useAIStatus()
  const { data: generalSetting } = useGeneralSetting({
    enabled: isDesktop,
  })

  const isAvailable =
    aiEnabled &&
    !/^\/settings\/?$/.test(location.pathname) &&
    location.pathname !== '/ai-chat-box'

  const routePageContext = useMemo<PageContext>(() => {
    const path = location.pathname
    const searchParams = new URLSearchParams(location.search)

    if (path === '/ai-chat-box') {
      return normalizePageContext({
        page: searchParams.get('page') || 'overview',
        namespace: searchParams.get('namespace') || '',
        resourceName: searchParams.get('resourceName') || '',
        resourceKind: searchParams.get('resourceKind') || '',
      })
    }

    const resource = params.resource || ''
    const name = params.name || ''
    const namespace = params.namespace || ''
    const normalizedKind = toSingularResource(resource)

    let page = 'overview'
    if (path === '/' || path === '/dashboard') {
      page = 'overview'
    } else if (name) {
      page = `${normalizedKind}-detail`
    } else if (resource) {
      page = `${resource}-list`
    }

    return normalizePageContext({
      page,
      namespace,
      resourceName: name,
      resourceKind: normalizedKind,
    })
  }, [
    location.pathname,
    location.search,
    params.resource,
    params.name,
    params.namespace,
  ])

  const aiChatOpenMode =
    isDesktop && generalSetting?.aiChatOpenMode !== 'overlay'
      ? 'sidecar'
      : 'overlay'
  const pageContext = useMemo<PageContext>(() => {
    if (location.pathname === '/ai-chat-box' && aiChatOpenMode === 'sidecar') {
      return syncedSidecarPageContext
    }
    return routePageContext
  }, [
    aiChatOpenMode,
    location.pathname,
    routePageContext,
    syncedSidecarPageContext,
  ])
  const canHandleSidecarShortcut =
    aiEnabled &&
    isDesktop &&
    aiChatOpenMode === 'sidecar' &&
    location.pathname === '/ai-chat-box'

  useEffect(() => {
    if (!isDesktop || aiChatOpenMode !== 'sidecar') {
      return
    }
    if (location.pathname === '/ai-chat-box') {
      return
    }
    persistAIChatSidecarPageContext(currentCluster, routePageContext)
  }, [
    aiChatOpenMode,
    currentCluster,
    isDesktop,
    location.pathname,
    routePageContext,
  ])

  useEffect(() => {
    if (!isDesktop || aiChatOpenMode !== 'sidecar') {
      return
    }
    if (location.pathname !== '/ai-chat-box') {
      return
    }

    const syncPageContext = () => {
      setSyncedSidecarPageContext(
        loadAIChatSidecarPageContext(currentCluster) || routePageContext
      )
    }

    syncPageContext()

    const storageKey = getAIChatSidecarPageContextStorageKey(currentCluster)
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey) {
        return
      }
      if (typeof event.newValue === 'string') {
        setSyncedSidecarPageContext(
          parseAIChatSidecarPageContext(event.newValue) || routePageContext
        )
        return
      }
      syncPageContext()
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [
    aiChatOpenMode,
    currentCluster,
    isDesktop,
    location.pathname,
    routePageContext,
  ])

  const openChat = useCallback(() => {
    if (!isAvailable) {
      return
    }
    if (aiChatOpenMode === 'sidecar') {
      void openAIChatSidecar({ pageContext })
      return
    }
    setIsOpen(true)
  }, [aiChatOpenMode, isAvailable, pageContext])

  const closeChat = useCallback(() => {
    if (aiChatOpenMode === 'sidecar') {
      void closeAIChatSidecar()
    }
    setIsOpen(false)
  }, [aiChatOpenMode])

  const toggleChat = useCallback(() => {
    if (!isAvailable) {
      return
    }
    if (aiChatOpenMode === 'sidecar') {
      void toggleAIChatSidecar({ pageContext })
      return
    }
    setIsOpen((prev) => !prev)
  }, [aiChatOpenMode, isAvailable, pageContext])

  useEffect(() => {
    if (isAvailable) {
      return
    }
    setIsOpen(false)
  }, [isAvailable])

  useEffect(() => {
    if (aiChatOpenMode === 'sidecar') {
      setIsOpen(false)
    }
  }, [aiChatOpenMode])

  useEffect(() => {
    if (!isAvailable && !canHandleSidecarShortcut) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault()
        if (aiChatOpenMode === 'sidecar') {
          void toggleAIChatSidecar({ pageContext })
          return
        }
        setIsOpen((prev) => !prev)
      }
    }

    const handleToggle = () => {
      if (aiChatOpenMode === 'sidecar') {
        void toggleAIChatSidecar({ pageContext })
        return
      }
      setIsOpen((prev) => !prev)
    }

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener(AI_CHAT_TOGGLE_EVENT, handleToggle)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener(AI_CHAT_TOGGLE_EVENT, handleToggle)
    }
  }, [aiChatOpenMode, canHandleSidecarShortcut, isAvailable, pageContext])

  return (
    <AIChatContext.Provider
      value={{
        isOpen,
        isAvailable,
        openChat,
        closeChat,
        toggleChat,
        pageContext,
      }}
    >
      {children}
    </AIChatContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAIChatContext() {
  const context = useContext(AIChatContext)
  if (context === undefined) {
    throw new Error('useAIChatContext must be used within an AIChatProvider')
  }
  return context
}
