import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import './index.css'
import './i18n'

import { AppearanceProvider } from './components/appearance-provider'
import { RuntimeProvider } from './contexts/runtime-context'
import { SidebarConfigProvider } from './contexts/sidebar-config-context'
import { installDesktopTargetBlankInterceptor } from './lib/desktop'
import { QueryProvider } from './lib/query-provider'
import { router } from './routes'

export function AppBootstrap() {
  useEffect(() => {
    return installDesktopTargetBlankInterceptor()
  }, [])

  return <RouterProvider router={router} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <AppearanceProvider
        defaultTheme="system"
        defaultColorTheme="default"
        defaultFont="maple"
      >
        <RuntimeProvider>
          <SidebarConfigProvider>
            <AppBootstrap />
          </SidebarConfigProvider>
        </RuntimeProvider>
      </AppearanceProvider>
    </QueryProvider>
  </StrictMode>
)
