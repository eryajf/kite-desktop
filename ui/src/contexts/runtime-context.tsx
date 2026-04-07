/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

import { DESKTOP_LOCAL_RUNTIME, getDesktopStatus } from '@/lib/desktop'

interface RuntimeContextType {
  isDesktop: boolean
  isReady: boolean
}

const RuntimeContext = createContext<RuntimeContextType | undefined>(undefined)

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RuntimeContextType>({
    isDesktop: false,
    isReady: false,
  })

  useEffect(() => {
    let active = true

    void getDesktopStatus()
      .then((status) => {
        if (!active) {
          return
        }

        setState({
          isDesktop:
            status.enabled && status.runtime === DESKTOP_LOCAL_RUNTIME,
          isReady: true,
        })
      })
      .catch(() => {
        if (!active) {
          return
        }

        setState({
          isDesktop: false,
          isReady: true,
        })
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <RuntimeContext.Provider value={state}>{children}</RuntimeContext.Provider>
  )
}

export function useRuntime() {
  const context = useContext(RuntimeContext)
  if (!context) {
    throw new Error('useRuntime must be used within a RuntimeProvider')
  }
  return context
}
