/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

import { trackDesktopEvent } from '@/lib/analytics'

export type GlobalSearchMode = 'all' | 'cluster'

interface GlobalSearchContextType {
  isOpen: boolean
  mode: GlobalSearchMode
  openSearch: (mode?: GlobalSearchMode, entry?: string) => void
  closeSearch: () => void
  toggleSearch: (mode?: GlobalSearchMode, entry?: string) => void
}

const GlobalSearchContext = createContext<GlobalSearchContextType | undefined>(
  undefined
)

export function useGlobalSearch() {
  const context = useContext(GlobalSearchContext)
  if (context === undefined) {
    throw new Error(
      'useGlobalSearch must be used within a GlobalSearchProvider'
    )
  }
  return context
}

interface GlobalSearchProviderProps {
  children: ReactNode
}

export function GlobalSearchProvider({ children }: GlobalSearchProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<GlobalSearchMode>('all')

  const openSearch = useCallback(
    (nextMode: GlobalSearchMode = 'all', entry: string = 'ui') => {
      trackDesktopEvent('global_search_open', {
        mode: nextMode,
        entry,
      })
      setMode(nextMode)
      setIsOpen(true)
    },
    []
  )

  const closeSearch = useCallback(() => {
    setIsOpen(false)
    setMode('all')
  }, [])

  const toggleSearch = useCallback(
    (nextMode: GlobalSearchMode = 'all', entry: string = 'ui') => {
      setMode(nextMode)
      setIsOpen((prev) => {
        const nextOpen = !prev
        if (nextOpen) {
          trackDesktopEvent('global_search_open', {
            mode: nextMode,
            entry,
          })
        }
        return nextOpen
      })
    },
    []
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command+Shift+K or Ctrl+Shift+K to open cluster switcher
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'k'
      ) {
        e.preventDefault()
        openSearch('cluster', 'shortcut')
        return
      }

      // Command+K or Ctrl+K to open search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSearch('all', 'shortcut')
        return
      }

      // Escape to close search
      if (e.key === 'Escape' && isOpen) {
        closeSearch()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [closeSearch, isOpen, openSearch])

  const value = {
    isOpen,
    mode,
    openSearch,
    closeSearch,
    toggleSearch,
  }

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
    </GlobalSearchContext.Provider>
  )
}
