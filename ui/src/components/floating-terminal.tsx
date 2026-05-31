import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRuntime } from '@/contexts/runtime-context'
import { useTerminal } from '@/contexts/terminal-context'
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Monitor,
  Server,
  SquareTerminal,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useGeneralSetting } from '@/lib/api'
import { TERMINAL_THEMES, TerminalTheme } from '@/types/themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Terminal } from '@/components/terminal'

const MIN_HEIGHT = 120
const DEFAULT_HEIGHT_VH = 40

export function FloatingTerminal() {
  const { t } = useTranslation()
  const { isDesktop } = useRuntime()
  const {
    isOpen,
    isMinimized,
    sessions,
    activeSessionId,
    activateSession,
    closeSession,
    closeTerminal,
    minimizeTerminal,
    restoreTerminal,
  } = useTerminal()
  const { data: generalSetting } = useGeneralSetting({
    enabled: isDesktop && isOpen,
  })
  const kubectlEnabled = generalSetting?.kubectlEnabled ?? true
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [height, setHeight] = useState(
    () => (window.innerHeight * DEFAULT_HEIGHT_VH) / 100
  )
  const terminalThemeName =
    (localStorage.getItem('terminal-theme') as TerminalTheme | null) ??
    'classic'
  const terminalBackground =
    TERMINAL_THEMES[terminalThemeName]?.background ??
    TERMINAL_THEMES.classic.background
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)
  const [toolbarHostElement, setToolbarHostElement] =
    useState<HTMLDivElement | null>(null)
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions]
  )
  const activeSessionDescription = useMemo(() => {
    if (!activeSession) return ''

    return [
      activeSession.clusterName,
      activeSession.namespace,
      activeSession.containerName,
    ]
      .filter(Boolean)
      .join(' · ')
  }, [activeSession])

  const setToolbarHostRef = useCallback((node: HTMLDivElement | null) => {
    setToolbarHostElement(node)
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMinimized || isFullscreen) return
      dragging.current = true
      startY.current = e.clientY
      startH.current = height
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [height, isFullscreen, isMinimized]
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const maxHeight = window.innerHeight * 0.5
    const newH = Math.min(
      maxHeight,
      Math.max(MIN_HEIGHT, startH.current + (startY.current - e.clientY))
    )
    setHeight(newH)
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  useEffect(() => {
    if (isOpen && !kubectlEnabled) {
      closeTerminal()
    }
  }, [closeTerminal, isOpen, kubectlEnabled])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  const handleMinimize = useCallback(() => {
    setIsFullscreen(false)
    if (isMinimized) {
      restoreTerminal()
      return
    }
    minimizeTerminal()
  }, [isMinimized, minimizeTerminal, restoreTerminal])

  const handleClose = useCallback(() => {
    setIsFullscreen(false)
    closeTerminal()
  }, [closeTerminal])
  const activeToolbarPortalElement = isMinimized ? null : toolbarHostElement

  if (!kubectlEnabled && sessions.every((session) => session.type === 'kubectl'))
    return null
  if (!isOpen) return null

  const panelClassName = isFullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-background shadow-2xl'
    : isMinimized
      ? [
          'fixed bottom-0 right-0 z-50 flex flex-col border-t bg-background shadow-2xl',
          'left-0 md:left-[var(--sidebar-width)]',
          'group-has-[[data-slot=sidebar][data-state=collapsed]]/sidebar-wrapper:md:left-[var(--sidebar-width-icon)]',
        ].join(' ')
      : 'fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t bg-background shadow-2xl'

  return (
    <div
      className={panelClassName}
      style={{
        height: isMinimized ? 40 : isFullscreen ? '100dvh' : height,
      }}
    >
      {/* Drag handle */}
      {!isMinimized && !isFullscreen && (
        <div
          className="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-10"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      )}

      <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/50 px-3 py-1">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-sm font-semibold text-foreground transition-opacity hover:opacity-70"
          onClick={handleMinimize}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 shadow-sm" />
          <span className="shrink-0 truncate">
            {t('floatingTerminal.workspace', 'Terminal Workspace')}
          </span>
          {activeSession ? (
            <span className="hidden min-w-0 truncate text-xs font-normal text-muted-foreground md:inline">
              {activeSession.title}
              {activeSessionDescription
                ? ` · ${activeSessionDescription}`
                : activeSession.subtitle
                  ? ` · ${activeSession.subtitle}`
                  : ''}
            </span>
          ) : null}
        </button>

        <div
          ref={setToolbarHostRef}
          className={cn(
            'ml-auto hidden min-w-0 items-center justify-end gap-2 lg:flex',
            isMinimized && 'lg:hidden'
          )}
        />

        <div className="flex shrink-0 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleFullscreen}
                disabled={isMinimized}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isFullscreen
                ? t('floatingTerminal.exitFullscreen')
                : t('floatingTerminal.fullscreen')}
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleMinimize}
              >
                {isMinimized ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isMinimized
                ? t('floatingTerminal.restore')
                : t('floatingTerminal.minimize')}
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('floatingTerminal.closeAllSessions', 'Close all sessions')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 flex-col"
        style={{ display: isMinimized ? 'none' : 'flex' }}
      >
        <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b bg-background px-2">
          {sessions.map((session) => {
            const active = session.id === activeSessionId
            return (
              <button
                key={session.id}
                type="button"
                className={cn(
                  'group flex h-7 min-w-[140px] max-w-[260px] items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => activateSession(session.id)}
              >
                {session.type === 'kubectl' ? (
                  <SquareTerminal className="h-3.5 w-3.5 shrink-0" />
                ) : session.type === 'node' ? (
                  <Server className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Monitor className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {session.title}
                </span>
                <span className="hidden shrink-0 text-[11px] text-muted-foreground xl:inline">
                  {session.clusterName}
                </span>
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-green-500"
                  aria-hidden="true"
                />
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded p-0.5 opacity-60 hover:bg-background hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeSession(session.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      closeSession(session.id)
                    }
                  }}
                  aria-label={t('floatingTerminal.closeSession')}
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            )
          })}
        </div>

        <div
          className="relative min-h-0 flex-1"
          style={{ backgroundColor: terminalBackground }}
        >
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'absolute inset-0 min-h-0',
                session.id === activeSessionId ? 'block' : 'hidden'
              )}
              style={{ backgroundColor: terminalBackground }}
            >
              <Terminal
                type={session.type}
                namespace={session.namespace}
                podName={session.podName}
                nodeName={session.nodeName}
                pods={session.pods}
                containers={session.containers}
                initContainers={session.initContainers}
                initialContainerName={session.containerName}
                clusterName={session.clusterName}
                embedded
                embeddedToolbar
                toolbarPortalElement={
                  session.id === activeSessionId
                    ? activeToolbarPortalElement
                    : null
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
