/* eslint-disable react-refresh/only-export-components */
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
import {
  DESKTOP_NAVIGATE_BACK_EVENT,
  DESKTOP_NAVIGATE_FORWARD_EVENT,
  DESKTOP_WINDOW_NAME_CHANGE_EVENT,
  getDesktopWindowName,
  syncDesktopNavigationState,
} from '@/lib/desktop'
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom'

interface NavigationEntry {
  key: string
  pathname: string
  search: string
  hash: string
}

interface NavigationState {
  entries: NavigationEntry[]
  index: number
}

interface NavigationContextValue {
  canGoBack: boolean
  canGoForward: boolean
  goBack: () => void
  goForward: () => void
}

type NavigationAction = ReturnType<typeof useNavigationType>

const NavigationContext = createContext<NavigationContextValue | undefined>(
  undefined
)

function toEntry(location: ReturnType<typeof useLocation>): NavigationEntry {
  return {
    key: location.key,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  }
}

function sameEntry(left: NavigationEntry, right: NavigationEntry) {
  return (
    left.key === right.key &&
    left.pathname === right.pathname &&
    left.search === right.search &&
    left.hash === right.hash
  )
}

function isShortcutTargetExcluded(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .monaco-editor, [data-page-find-ignore="true"]'
    )
  )
}

function isMainDesktopWindowName(windowName: string) {
  return windowName === 'main'
}

function canHandleDesktopNavigation(windowName: string) {
  return windowName === '' || isMainDesktopWindowName(windowName)
}

function updateNavigationState(
  previous: NavigationState,
  nextEntry: NavigationEntry,
  action: NavigationAction
): NavigationState {
  if (previous.entries.length === 0) {
    return {
      entries: [nextEntry],
      index: 0,
    }
  }

  switch (action) {
    case 'PUSH': {
      const nextEntries = previous.entries
        .slice(0, previous.index + 1)
        .filter((entry) => entry.key !== nextEntry.key)

      nextEntries.push(nextEntry)

      return {
        entries: nextEntries,
        index: nextEntries.length - 1,
      }
    }
    case 'REPLACE': {
      const nextEntries = [...previous.entries]
      nextEntries[previous.index] = nextEntry

      return {
        entries: nextEntries,
        index: previous.index,
      }
    }
    case 'POP':
    default: {
      const existingIndex = previous.entries.findIndex(
        (entry) => entry.key === nextEntry.key
      )
      if (existingIndex >= 0) {
        if (sameEntry(previous.entries[existingIndex], nextEntry)) {
          return {
            entries: previous.entries,
            index: existingIndex,
          }
        }

        const nextEntries = [...previous.entries]
        nextEntries[existingIndex] = nextEntry
        return {
          entries: nextEntries,
          index: existingIndex,
        }
      }

      return {
        entries: [nextEntry],
        index: 0,
      }
    }
  }
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const { isDesktop } = useRuntime()
  const [windowName, setWindowName] = useState(() => getDesktopWindowName())
  const [state, setState] = useState<NavigationState>(() => ({
    entries: [toEntry(location)],
    index: 0,
  }))

  useEffect(() => {
    const nextEntry = toEntry(location)
    setState((previous) => updateNavigationState(previous, nextEntry, navigationType))
  }, [location, navigationType])

  const canGoBack = state.index > 0
  const canGoForward = state.index < state.entries.length - 1
  const isMainDesktopWindow = isDesktop && isMainDesktopWindowName(windowName)

  useEffect(() => {
    if (!isDesktop) {
      return
    }

    const syncWindowName = () => {
      setWindowName(getDesktopWindowName())
    }

    syncWindowName()
    window.addEventListener(DESKTOP_WINDOW_NAME_CHANGE_EVENT, syncWindowName)

    return () => {
      window.removeEventListener(
        DESKTOP_WINDOW_NAME_CHANGE_EVENT,
        syncWindowName
      )
    }
  }, [isDesktop])

  const goBack = useCallback(() => {
    if (!canGoBack) {
      return
    }
    void navigate(-1)
  }, [canGoBack, navigate])

  const goForward = useCallback(() => {
    if (!canGoForward) {
      return
    }
    void navigate(1)
  }, [canGoForward, navigate])

  useEffect(() => {
    if (!isDesktop) {
      return
    }

    const handleBack = () => {
      if (!canHandleDesktopNavigation(getDesktopWindowName())) {
        return
      }
      goBack()
    }
    const handleForward = () => {
      if (!canHandleDesktopNavigation(getDesktopWindowName())) {
        return
      }
      goForward()
    }

    window.addEventListener(DESKTOP_NAVIGATE_BACK_EVENT, handleBack)
    window.addEventListener(DESKTOP_NAVIGATE_FORWARD_EVENT, handleForward)

    return () => {
      window.removeEventListener(DESKTOP_NAVIGATE_BACK_EVENT, handleBack)
      window.removeEventListener(DESKTOP_NAVIGATE_FORWARD_EVENT, handleForward)
    }
  }, [goBack, goForward, isDesktop])

  useEffect(() => {
    if (!isDesktop) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutTargetExcluded(event.target)) {
        return
      }

      if (!canHandleDesktopNavigation(getDesktopWindowName())) {
        return
      }

      const isMacBackShortcut =
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === '[' || event.code === 'BracketLeft')

      if (isMacBackShortcut) {
        event.preventDefault()
        goBack()
        return
      }

      const isMacForwardShortcut =
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === ']' || event.code === 'BracketRight')

      if (isMacForwardShortcut) {
        event.preventDefault()
        goForward()
        return
      }

      const isNonMacBackShortcut =
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        (event.key === 'ArrowLeft' || event.code === 'ArrowLeft')

      if (isNonMacBackShortcut) {
        event.preventDefault()
        goBack()
        return
      }

      const isNonMacForwardShortcut =
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        (event.key === 'ArrowRight' || event.code === 'ArrowRight')

      if (isNonMacForwardShortcut) {
        event.preventDefault()
        goForward()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [goBack, goForward, isDesktop])

  useEffect(() => {
    if (!isMainDesktopWindow) {
      return
    }

    void syncDesktopNavigationState({
      windowName: 'main',
      canGoBack,
      canGoForward,
    }).catch((error) => {
      console.error('Failed to sync desktop navigation state:', error)
    })
  }, [canGoBack, canGoForward, isMainDesktopWindow])

  const value = useMemo<NavigationContextValue>(
    () => ({
      canGoBack,
      canGoForward,
      goBack,
      goForward,
    }),
    [canGoBack, canGoForward, goBack, goForward]
  )

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
}
