import './App.css'

import { lazy, ReactNode, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'

import { AIChatbox, StandaloneAIChatbox } from './components/ai-chat/ai-chatbox'
import { AppSidebar } from './components/app-sidebar'
import { GlobalSearch } from './components/global-search'
import {
  GlobalSearchProvider,
  useGlobalSearch,
} from './components/global-search-provider'
import { PageFindProvider } from './components/page-find-provider'
import { SiteHeader } from './components/site-header'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { Toaster } from './components/ui/sonner'
import { UpdateDownloadToast } from './components/update-download-toast'
import { AIChatProvider } from './contexts/ai-chat-context'
import { ClusterProvider } from './contexts/cluster-context'
import { NavigationProvider } from './contexts/navigation-context'
import { TerminalProvider, useTerminal } from './contexts/terminal-context'
import { useCluster } from './hooks/use-cluster'
import { apiClient } from './lib/api-client'
import { trackPage } from './lib/analytics'
import { getAnalyticsPageKey } from './lib/analytics-route'
import { prefetchMonaco } from './lib/monaco-runtime'

const FloatingTerminal = lazy(async () => {
  const module = await import('./components/floating-terminal')
  return { default: module.FloatingTerminal }
})

function ClusterGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { currentCluster, isLoading, error } = useCluster()

  useEffect(() => {
    apiClient.setClusterProvider(() => {
      return currentCluster || localStorage.getItem('current-cluster')
    })
  }, [currentCluster])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <span>{t('cluster.loading')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-500">
          <p>{t('cluster.error', { error: error.message })}</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function AppContent() {
  const { isOpen, mode, closeSearch } = useGlobalSearch()
  const { isOpen: isTerminalOpen } = useTerminal()
  const [searchParams] = useSearchParams()
  const isIframe = searchParams.get('iframe') === 'true'

  if (isIframe) {
    return <Outlet />
  }

  return (
    <>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset className="h-full overflow-hidden">
          <SiteHeader />
          <div className="@container/main flex flex-1 min-h-0 flex-col overflow-y-auto scrollbar-hide">
            <div className="flex min-h-0 flex-1 flex-col gap-2 py-2 md:gap-3">
              <div className="pl-2.5 pr-2.5">
                <Outlet />
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <GlobalSearch open={isOpen} mode={mode} onOpenChange={closeSearch} />
      {isTerminalOpen ? (
        <Suspense fallback={null}>
          <FloatingTerminal />
        </Suspense>
      ) : null}
      <UpdateDownloadToast />
      <AIChatbox />
      <Toaster />
    </>
  )
}

function AnalyticsBridge() {
  const location = useLocation()

  useEffect(() => {
    trackPage(getAnalyticsPageKey(location.pathname))
  }, [location.pathname])

  return null
}

function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    prefetchMonaco()
  }, [])

  return (
    <TerminalProvider>
      <ClusterProvider>
        <NavigationProvider>
          <GlobalSearchProvider>
            <PageFindProvider>
              <AIChatProvider>{children}</AIChatProvider>
            </PageFindProvider>
          </GlobalSearchProvider>
        </NavigationProvider>
      </ClusterProvider>
    </TerminalProvider>
  )
}

function App() {
  return (
    <AppProviders>
      <AnalyticsBridge />
      <ClusterGate>
        <AppContent />
      </ClusterGate>
    </AppProviders>
  )
}

export function StandaloneAIChatApp() {
  return (
    <AppProviders>
      <AnalyticsBridge />
      <ClusterGate>
        <StandaloneAIChatbox />
      </ClusterGate>
    </AppProviders>
  )
}

export default App
