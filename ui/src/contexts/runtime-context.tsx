/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  checkDesktopUpdate,
  DESKTOP_LOCAL_RUNTIME,
  getDesktopStatus,
  getDesktopUpdateState,
} from '@/lib/desktop'

interface RuntimeContextType {
  isDesktop: boolean
  isReady: boolean
}

const RuntimeContext = createContext<RuntimeContextType | undefined>(undefined)

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
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
          isDesktop: status.enabled && status.runtime === DESKTOP_LOCAL_RUNTIME,
          isReady: true,
        })

        if (status.enabled && status.runtime === DESKTOP_LOCAL_RUNTIME) {
          void checkDesktopUpdate(false)
            .then(() => getDesktopUpdateState())
            .then((updateState) => {
              if (!active || !updateState) {
                return
              }
              queryClient.setQueryData(['desktop-update-state'], {
                ignoredVersion: updateState.ignoredVersion || '',
                lastCheck: updateState.lastCheck,
                download: updateState.download,
                readyToApply: updateState.readyToApply,
              })
            })
            .catch(() => undefined)
        }
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
