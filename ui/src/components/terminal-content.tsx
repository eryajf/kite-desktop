import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  IconClearAll,
  IconFolder,
  IconMaximize,
  IconMinimize,
  IconSettings,
  IconTerminal,
} from '@tabler/icons-react'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal as XTerm } from '@xterm/xterm'
import { Container, Pod } from 'kubernetes-types/core/v1'

import '@xterm/xterm/css/xterm.css'

import { useTranslation } from 'react-i18next'

import { TERMINAL_THEMES, TerminalTheme } from '@/types/themes'
import { appendClusterNameParam } from '@/lib/cluster-transport'
import {
  loadViewerPreference,
  updateViewerPreference,
} from '@/lib/desktop-preferences'
import { toSimpleContainer } from '@/lib/k8s'
import { getWebSocketUrl } from '@/lib/subpath'
import { translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { ConnectionIndicator } from './connection-indicator'
import { NetworkSpeedIndicator } from './network-speed-indicator'
import { PodTerminalFileTree } from './pod-terminal-file-tree'
import { ContainerSelector } from './selector/container-selector'
import { PodSelector } from './selector/pod-selector'

export interface TerminalProps {
  type?: 'node' | 'pod' | 'kubectl'
  clusterName?: string
  namespace?: string
  podName?: string
  nodeName?: string
  pods?: Pod[]
  containers?: Container[]
  initContainers?: Container[]
  initialContainerName?: string
  /** When true, hides the internal toolbar and fills parent container */
  embedded?: boolean
  /** When true with embedded mode, shows session-scoped terminal controls */
  embeddedToolbar?: boolean
  /** Optional host for rendering embedded controls into the workspace header */
  toolbarPortalElement?: HTMLElement | null
}

export function Terminal({
  clusterName,
  namespace,
  podName,
  pods,
  nodeName,
  containers: _containers = [],
  initContainers = [],
  initialContainerName,
  type = 'pod',
  embedded = false,
  embeddedToolbar = false,
  toolbarPortalElement,
}: TerminalProps) {
  const containers = useMemo(() => {
    return toSimpleContainer(initContainers, _containers)
  }, [_containers, initContainers])
  const [selectedPod, setSelectedPod] = useState<string>('')
  const [selectedContainer, setSelectedContainer] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectFlag, setReconnectFlag] = useState(false)
  const [networkSpeed, setNetworkSpeed] = useState({ upload: 0, download: 0 })
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>(() => {
    const saved = localStorage.getItem('terminal-theme')
    return (saved as TerminalTheme) || 'classic'
  })
  const [previewTerminalTheme, setPreviewTerminalTheme] =
    useState<TerminalTheme | null>(null)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('log-viewer-font-size')
    return saved ? parseInt(saved, 10) : 14
  })
  const [previewFontSize, setPreviewFontSize] = useState<number | null>(null)
  const [cursorStyle, setCursorStyle] = useState<'block' | 'underline' | 'bar'>(
    () => {
      const saved = localStorage.getItem('terminal-cursor-style')
      return (saved as 'block' | 'underline' | 'bar') || 'bar'
    }
  )
  const [previewCursorStyle, setPreviewCursorStyle] = useState<
    'block' | 'underline' | 'bar' | null
  >(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFileTree, setShowFileTree] = useState(false)
  const viewerPreferenceReadyRef = useRef(false)
  const lastPersistedViewerPreferenceRef = useRef<string | null>(null)
  const selectedTerminalThemeRef = useRef<TerminalTheme>(terminalTheme)
  const selectedFontSizeRef = useRef(fontSize)
  const selectedCursorStyleRef = useRef(cursorStyle)

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const networkStatsRef = useRef({
    lastReset: Date.now(),
    bytesReceived: 0,
    bytesSent: 0,
    lastUpdate: Date.now(),
  })
  const speedUpdateTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const { t } = useTranslation()
  const visibleTerminalTheme = previewTerminalTheme ?? terminalTheme
  const visibleFontSize = previewFontSize ?? fontSize
  const visibleCursorStyle = previewCursorStyle ?? cursorStyle
  const visibleTerminalBackground =
    TERMINAL_THEMES[visibleTerminalTheme].background

  useEffect(() => {
    selectedTerminalThemeRef.current = terminalTheme
  }, [terminalTheme])

  useEffect(() => {
    selectedFontSizeRef.current = fontSize
  }, [fontSize])

  useEffect(() => {
    selectedCursorStyleRef.current = cursorStyle
  }, [cursorStyle])

  useEffect(() => {
    let cancelled = false

    const loadPreference = async () => {
      try {
        const preference = await loadViewerPreference()
        if (cancelled) {
          return
        }

        setTerminalTheme(preference.terminal.theme as TerminalTheme)
        setFontSize(preference.terminal.fontSize)
        setCursorStyle(preference.terminal.cursorStyle)
        localStorage.setItem('terminal-theme', preference.terminal.theme)
        localStorage.setItem(
          'log-viewer-font-size',
          preference.terminal.fontSize.toString()
        )
        localStorage.setItem(
          'terminal-cursor-style',
          preference.terminal.cursorStyle
        )
        lastPersistedViewerPreferenceRef.current = JSON.stringify(
          preference.terminal
        )
      } catch (error) {
        console.error('Failed to load viewer preference from storage:', error)
      } finally {
        if (!cancelled) {
          viewerPreferenceReadyRef.current = true
        }
      }
    }

    void loadPreference()

    return () => {
      cancelled = true
    }
  }, [])

  // Initialize pod/container state on props change
  useEffect(() => {
    setSelectedPod(podName || pods?.[0]?.metadata?.name || '')
  }, [podName, pods])

  useEffect(() => {
    if (containers.length === 0) {
      setSelectedContainer('')
      return
    }

    setSelectedContainer((current) => {
      if (!current || !containers.find((c) => c.name === current)) {
        return initialContainerName &&
          containers.find((c) => c.name === initialContainerName)
          ? initialContainerName
          : containers[0].name
      }
      return current
    })
  }, [containers, initialContainerName])

  const applyTerminalTheme = useCallback((theme: TerminalTheme) => {
    if (xtermRef.current) {
      const currentTheme = TERMINAL_THEMES[theme]
      xtermRef.current.options.theme = {
        background: currentTheme.background,
        foreground: currentTheme.foreground,
        cursor: currentTheme.cursor,
        selectionBackground: currentTheme.selection,
        black: currentTheme.black,
        red: currentTheme.red,
        green: currentTheme.green,
        yellow: currentTheme.yellow,
        blue: currentTheme.blue,
        magenta: currentTheme.magenta,
        cyan: currentTheme.cyan,
        white: currentTheme.white,
        brightBlack: currentTheme.brightBlack,
        brightRed: currentTheme.brightRed,
        brightGreen: currentTheme.brightGreen,
        brightYellow: currentTheme.brightYellow,
        brightBlue: currentTheme.brightBlue,
        brightMagenta: currentTheme.brightMagenta,
        brightCyan: currentTheme.brightCyan,
        brightWhite: currentTheme.brightWhite,
      }
      // Force refresh to apply the new theme
      xtermRef.current.refresh(0, xtermRef.current.rows - 1)
    }
  }, [])

  // Handle theme change and persist to localStorage
  const handleThemeChange = useCallback(
    (theme: TerminalTheme) => {
      selectedTerminalThemeRef.current = theme
      setPreviewTerminalTheme(null)
      setTerminalTheme(theme)
      localStorage.setItem('terminal-theme', theme)
      applyTerminalTheme(theme)
    },
    [applyTerminalTheme]
  )

  const handleThemePreview = useCallback(
    (theme: TerminalTheme) => {
      setPreviewTerminalTheme(theme)
      applyTerminalTheme(theme)
    },
    [applyTerminalTheme]
  )

  const restoreThemePreview = useCallback(() => {
    setPreviewTerminalTheme(null)
    applyTerminalTheme(selectedTerminalThemeRef.current)
  }, [applyTerminalTheme])

  const applyFontSize = useCallback((size: number) => {
    if (xtermRef.current && fitAddonRef.current) {
      xtermRef.current.options.fontSize = size
      setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit()
        }
      }, 100)
    }
  }, [])

  // Handle font size change and persist to localStorage
  const handleFontSizeChange = useCallback(
    (size: number) => {
      selectedFontSizeRef.current = size
      setPreviewFontSize(null)
      setFontSize(size)
      localStorage.setItem('log-viewer-font-size', size.toString()) // 与 log viewer 共用同一个 key
      applyFontSize(size)
    },
    [applyFontSize]
  )

  const handleFontSizePreview = useCallback(
    (size: number) => {
      setPreviewFontSize(size)
      applyFontSize(size)
    },
    [applyFontSize]
  )

  const restoreFontSizePreview = useCallback(() => {
    setPreviewFontSize(null)
    applyFontSize(selectedFontSizeRef.current)
  }, [applyFontSize])

  const applyCursorStyle = useCallback(
    (style: 'block' | 'underline' | 'bar') => {
      if (xtermRef.current) {
        xtermRef.current.options.cursorStyle = style
      }
    },
    []
  )

  const handleCursorStyleChange = useCallback(
    (style: 'block' | 'underline' | 'bar') => {
      selectedCursorStyleRef.current = style
      setPreviewCursorStyle(null)
      setCursorStyle(style)
      localStorage.setItem('terminal-cursor-style', style)
      applyCursorStyle(style)
    },
    [applyCursorStyle]
  )

  const handleCursorStylePreview = useCallback(
    (style: 'block' | 'underline' | 'bar') => {
      setPreviewCursorStyle(style)
      applyCursorStyle(style)
    },
    [applyCursorStyle]
  )

  const restoreCursorStylePreview = useCallback(() => {
    setPreviewCursorStyle(null)
    applyCursorStyle(selectedCursorStyleRef.current)
  }, [applyCursorStyle])

  useEffect(() => {
    if (previewFontSize === null) {
      applyFontSize(fontSize)
    }
  }, [applyFontSize, fontSize, previewFontSize])

  useEffect(() => {
    if (previewCursorStyle === null) {
      applyCursorStyle(cursorStyle)
    }
  }, [applyCursorStyle, cursorStyle, previewCursorStyle])

  useEffect(() => {
    if (!viewerPreferenceReadyRef.current) {
      return
    }

    const serialized = JSON.stringify({
      theme: terminalTheme,
      cursorStyle,
      fontSize,
    })
    if (serialized === lastPersistedViewerPreferenceRef.current) {
      return
    }

    lastPersistedViewerPreferenceRef.current = serialized
    void updateViewerPreference((preference) => ({
      ...preference,
      terminal: {
        theme: terminalTheme,
        cursorStyle,
        fontSize,
      },
    })).catch((error) => {
      console.error('Failed to save viewer preference to storage:', error)
    })
  }, [cursorStyle, fontSize, terminalTheme])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v)
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }, 200)
  }, [])

  const handleContainerChange = useCallback((containerName?: string) => {
    if (containerName) setSelectedContainer(containerName)
  }, [])

  const handlePodChange = useCallback((podName?: string) => {
    setSelectedPod(podName || '')
  }, [])

  const canShowFileTree = type === 'pod' && Boolean(namespace)

  // Calculate network speed
  const updateNetworkStats = useCallback(
    (dataSize: number, isOutgoing: boolean) => {
      const stats = networkStatsRef.current

      if (isOutgoing) {
        stats.bytesSent += dataSize
      } else {
        stats.bytesReceived += dataSize
      }
    },
    []
  )

  // Unified terminal and websocket lifecycle
  useEffect(() => {
    if (type === 'pod') {
      if (!pods || pods.length === 0) if (!selectedPod) return
      if (!selectedContainer) return
    }
    if (type === 'node' && !nodeName) return
    if (type === 'kubectl') {
      // kubectl type needs no pod/container selection
    }
    if (!terminalRef.current) return

    if (xtermRef.current) xtermRef.current.dispose()
    if (wsRef.current) wsRef.current.close()

    const currentTheme = TERMINAL_THEMES[terminalTheme]
    const terminal = new XTerm({
      fontFamily: '"Maple Mono", Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize,
      theme: {
        background: currentTheme.background,
        foreground: currentTheme.foreground,
        cursor: currentTheme.cursor,
        selectionBackground: currentTheme.selection,
        black: currentTheme.black,
        red: currentTheme.red,
        green: currentTheme.green,
        yellow: currentTheme.yellow,
        blue: currentTheme.blue,
        magenta: currentTheme.magenta,
        cyan: currentTheme.cyan,
        white: currentTheme.white,
        brightBlack: currentTheme.brightBlack,
        brightRed: currentTheme.brightRed,
        brightGreen: currentTheme.brightGreen,
        brightYellow: currentTheme.brightYellow,
        brightBlue: currentTheme.brightBlue,
        brightMagenta: currentTheme.brightMagenta,
        brightCyan: currentTheme.brightCyan,
        brightWhite: currentTheme.brightWhite,
      },
      cursorBlink: true,
      allowTransparency: true,
      cursorStyle,
      scrollback: 10000,
    })
    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    const webLinksAddon = new WebLinksAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(searchAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(terminalRef.current)
    fitAddon.fit()
    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    // Apply additional styles to prevent scroll bubbling
    if (terminal.element) {
      terminal.element.style.backgroundColor = currentTheme.background
      terminal.element.style.overscrollBehavior = 'none'
      terminal.element.style.touchAction = 'none'
      terminal.element.addEventListener(
        'wheel',
        (e) => {
          e.stopPropagation()
          e.preventDefault()
        },
        { passive: false }
      )
    }

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    // WebSocket connection
    setIsConnected(false)
    const currentCluster = clusterName ?? localStorage.getItem('current-cluster')
    const wsPath =
      type === 'pod'
        ? appendClusterNameParam(
            `/api/v1/terminal/${namespace}/${selectedPod}/ws?container=${encodeURIComponent(
              selectedContainer
            )}`,
            currentCluster
          )
        : type === 'node'
          ? appendClusterNameParam(
              `/api/v1/node-terminal/${nodeName}/ws`,
              currentCluster
            )
          : appendClusterNameParam('/api/v1/kubectl-terminal/ws', currentCluster)
    const wsUrl = getWebSocketUrl(wsPath)
    const websocket = new WebSocket(wsUrl)
    wsRef.current = websocket

    websocket.onopen = () => {
      setIsConnected(true)
      networkStatsRef.current = {
        lastReset: Date.now(),
        bytesReceived: 0,
        bytesSent: 0,
        lastUpdate: Date.now(),
      }
      setNetworkSpeed({ upload: 0, download: 0 })
      if (speedUpdateTimerRef.current)
        clearInterval(speedUpdateTimerRef.current)
      if (fitAddonRef.current) {
        const { cols, rows } = fitAddonRef.current.proposeDimensions()!
        if (cols && rows) {
          const message = JSON.stringify({ type: 'resize', cols, rows })
          websocket.send(message)
          updateNetworkStats(new Blob([message]).size, true)
        }
      }
      speedUpdateTimerRef.current = setInterval(() => {
        const now = Date.now()
        const stats = networkStatsRef.current
        const timeDiff = (now - stats.lastReset) / 1000
        if (timeDiff > 0) {
          setNetworkSpeed({
            upload: stats.bytesSent / timeDiff,
            download: stats.bytesReceived / timeDiff,
          })
          if (timeDiff >= 3) {
            stats.lastReset = now
            stats.bytesSent = 0
            stats.bytesReceived = 0
          }
        }
      }, 500)

      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      pingTimerRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          const pingMessage = JSON.stringify({ type: 'ping' })
          websocket.send(pingMessage)
          updateNetworkStats(new Blob([pingMessage]).size, true)
        }
      }, 30000)

      terminal.writeln(
        `\x1b[32mConnected to ${type === 'kubectl' ? 'kubectl' : type} terminal!\x1b[0m`
      )
      terminal.writeln('')
    }

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        const dataSize = new Blob([event.data]).size
        updateNetworkStats(dataSize, false)
        switch (message.type) {
          case 'stdout':
          case 'stderr':
            terminal.write(message.data)
            break
          case 'info':
            terminal.writeln(`\x1b[34m${message.data}\x1b[0m`)
            break
          case 'connected':
            terminal.writeln(`\x1b[32m${message.data}\x1b[0m`)
            break
          case 'error':
            terminal.writeln(
              `\x1b[31mError: ${translateError(new Error(message.data), t)}\x1b[0m`
            )
            setIsConnected(false)
            break
          case 'pong':
            // Ignore pong messages from server
            break
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
      terminal.writeln('\x1b[31mWebSocket connection error\x1b[0m')
      setIsConnected(false)
    }

    websocket.onclose = (event) => {
      setIsConnected(false)
      setNetworkSpeed({ upload: 0, download: 0 })
      if (speedUpdateTimerRef.current) {
        clearInterval(speedUpdateTimerRef.current)
        speedUpdateTimerRef.current = null
      }
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current)
        pingTimerRef.current = null
      }
      if (event.code !== 1000) {
        terminal.writeln('\x1b[31mConnection closed unexpectedly\x1b[0m')
      } else {
        terminal.writeln('\x1b[32mConnection closed\x1b[0m')
      }
    }

    terminal.onData((data) => {
      if (websocket.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({ type: 'stdin', data })
        websocket.send(message)
        updateNetworkStats(new Blob([message]).size, true)
      }
    })

    let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null
    const handleTerminalResize = () => {
      // Debounce: wait for CSS transition to finish before fitting/resizing
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
      resizeDebounceTimer = setTimeout(() => {
        if (!fitAddonRef.current || websocket.readyState !== WebSocket.OPEN) {
          return
        }
        fitAddonRef.current.fit()
        const { cols, rows } = terminal
        const message = JSON.stringify({ type: 'resize', cols, rows })
        websocket.send(message)
        updateNetworkStats(new Blob([message]).size, true)
      }, 150)
    }

    let resizeObserver: ResizeObserver | null = null
    if (terminalRef.current) {
      resizeObserver = new ResizeObserver(handleTerminalResize)
      resizeObserver.observe(terminalRef.current)
    }

    const handleWheelEvent = (e: WheelEvent | TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }

    const currentTerminalRef = terminalRef.current
    if (currentTerminalRef) {
      currentTerminalRef.addEventListener('wheel', handleWheelEvent, {
        passive: false,
      })
      currentTerminalRef.addEventListener('touchmove', handleWheelEvent, {
        passive: false,
      })
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (currentTerminalRef) {
        currentTerminalRef.removeEventListener('wheel', handleWheelEvent)
        currentTerminalRef.removeEventListener('touchmove', handleWheelEvent)
      }
      terminal.dispose()
      websocket.close()
      if (speedUpdateTimerRef.current)
        clearInterval(speedUpdateTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedPod,
    selectedContainer,
    clusterName,
    namespace,
    type,
    updateNetworkStats,
    reconnectFlag,
  ])

  // Clear terminal
  const clearTerminal = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear()
    }
  }, [])

  // Shared terminal div (the actual xterm canvas)
  const terminalDiv = (
    <div
      ref={terminalRef}
      className="flex-1 h-full min-h-0 w-full"
      style={{
        backgroundColor: visibleTerminalBackground,
        maxHeight: '100%',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'none',
        position: 'relative',
        isolation: 'isolate',
      }}
    />
  )

  const toolbarControls = (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {embeddedToolbar && (
        <NetworkSpeedIndicator
          uploadSpeed={networkSpeed.upload}
          downloadSpeed={networkSpeed.download}
        />
      )}

      {containers.length > 1 && (
        <ContainerSelector
          containers={containers}
          showAllOption={false}
          selectedContainer={selectedContainer}
          onContainerChange={handleContainerChange}
        />
      )}

      {pods && pods.length > 0 && (
        <PodSelector
          pods={pods}
          selectedPod={selectedPod}
          onPodChange={handlePodChange}
        />
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={t('terminalContent.settings', 'Terminal settings')}
            title={t('terminalContent.settings', 'Terminal settings')}
          >
            <IconSettings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="terminal-theme">
                  {t('terminalContent.terminalTheme')}
                </Label>
                <Select value={terminalTheme} onValueChange={handleThemeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent onPointerLeave={restoreThemePreview}>
                    {Object.entries(TERMINAL_THEMES).map(([key, theme]) => (
                      <SelectItem
                        key={key}
                        value={key}
                        onPointerEnter={() =>
                          handleThemePreview(key as TerminalTheme)
                        }
                        onFocus={() => handleThemePreview(key as TerminalTheme)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full border border-gray-400"
                            style={{
                              backgroundColor: theme.background,
                            }}
                          />
                          <span className="text-sm">{theme.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className="p-3 rounded space-y-1"
                style={{
                  backgroundColor:
                    TERMINAL_THEMES[visibleTerminalTheme].background,
                  color: TERMINAL_THEMES[visibleTerminalTheme].foreground,
                  fontSize: `${visibleFontSize}px`,
                }}
              >
                <div>
                  <span
                    style={{
                      color: TERMINAL_THEMES[visibleTerminalTheme].green,
                    }}
                  >
                    user@pod:~$
                  </span>{' '}
                  ls -la
                </div>
                <div style={{ color: TERMINAL_THEMES[visibleTerminalTheme].blue }}>
                  drwxr-xr-x 3 user user 4096 Dec 9 10:30 .
                </div>
                <div
                  style={{ color: TERMINAL_THEMES[visibleTerminalTheme].yellow }}
                >
                  -rw-r--r-- 1 user user 220 Dec 9 10:30 README.md
                </div>
                <div style={{ color: TERMINAL_THEMES[visibleTerminalTheme].red }}>
                  -rwx------ 1 user user 1024 Dec 9 10:30 script.sh
                </div>
                <div className="flex items-center gap-1 opacity-80">
                  <span>{t('terminalContent.cursorStyle')}</span>
                  <span>
                    {visibleCursorStyle === 'block'
                      ? t('terminalContent.block')
                      : visibleCursorStyle === 'underline'
                        ? t('terminalContent.underline')
                        : t('terminalContent.bar')}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="font-size">{t('logViewer.fontSize')}</Label>
                <Select
                  value={fontSize.toString()}
                  onValueChange={(value) => handleFontSizeChange(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent onPointerLeave={restoreFontSizePreview}>
                    {[10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map(
                      (size) => (
                        <SelectItem
                          key={size}
                          value={size.toString()}
                          onPointerEnter={() => handleFontSizePreview(size)}
                          onFocus={() => handleFontSizePreview(size)}
                        >
                          {size}px
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cursor-style">
                  {t('terminalContent.cursorStyle')}
                </Label>
                <Select
                  value={cursorStyle}
                  onValueChange={handleCursorStyleChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent onPointerLeave={restoreCursorStylePreview}>
                    <SelectItem
                      value="block"
                      onPointerEnter={() => handleCursorStylePreview('block')}
                      onFocus={() => handleCursorStylePreview('block')}
                    >
                      {t('terminalContent.block')}
                    </SelectItem>
                    <SelectItem
                      value="underline"
                      onPointerEnter={() =>
                        handleCursorStylePreview('underline')
                      }
                      onFocus={() => handleCursorStylePreview('underline')}
                    >
                      {t('terminalContent.underline')}
                    </SelectItem>
                    <SelectItem
                      value="bar"
                      onPointerEnter={() => handleCursorStylePreview('bar')}
                      onFocus={() => handleCursorStylePreview('bar')}
                    >
                      {t('terminalContent.bar')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {canShowFileTree && (
        <Button
          variant={showFileTree ? 'secondary' : 'outline'}
          size="sm"
          aria-label={t('terminalContent.toggleFileTree')}
          title={t('terminalContent.toggleFileTree')}
          onClick={() => setShowFileTree((value) => !value)}
        >
          <IconFolder className="h-4 w-4" />
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={clearTerminal}
        aria-label={t('terminalContent.clear', 'Clear terminal')}
        title={t('terminalContent.clear', 'Clear terminal')}
      >
        <IconClearAll className="h-4 w-4" />
      </Button>
    </div>
  )
  const shouldRenderEmbeddedToolbarInline =
    embeddedToolbar && !toolbarPortalElement

  const terminalBody = (
    <div
      className="flex h-full min-h-0"
      style={{ backgroundColor: visibleTerminalBackground }}
    >
      {canShowFileTree && showFileTree ? (
        <div className="h-full min-h-0 w-[360px] shrink-0 max-w-[45%]">
          <PodTerminalFileTree
            clusterName={clusterName}
            namespace={namespace}
            podName={selectedPod}
            containerName={selectedContainer}
          />
        </div>
      ) : null}
      {terminalDiv}
    </div>
  )

  // Embedded mode: no header, fills parent completely
  if (embedded) {
    if (embeddedToolbar) {
      return (
        <div
          className="flex h-full min-h-0 w-full flex-col"
          style={{ backgroundColor: visibleTerminalBackground }}
        >
          {toolbarPortalElement
            ? createPortal(toolbarControls, toolbarPortalElement)
            : null}
          {shouldRenderEmbeddedToolbarInline ? (
            <div className="flex min-h-10 shrink-0 items-center justify-end gap-3 border-b bg-muted/30 px-3 py-1">
              {toolbarControls}
            </div>
          ) : null}
          <div
            className="min-h-0 flex-1"
            style={{ backgroundColor: visibleTerminalBackground }}
          >
            {terminalBody}
          </div>
        </div>
      )
    }

    return (
      <div
        className="flex flex-col h-full w-full min-h-0"
        style={{ backgroundColor: visibleTerminalBackground }}
      >
        {terminalDiv}
      </div>
    )
  }

  return (
    <Card
      className={`flex flex-col gap-0 py-2 ${isFullscreen ? 'fixed inset-0 z-50 h-[100dvh]' : 'h-[calc(100dvh-180px)]'}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <IconTerminal className="h-5 w-5" />
              {t('pods.terminal')}
            </CardTitle>
            <ConnectionIndicator
              isConnected={isConnected}
              onReconnect={() => {
                setReconnectFlag((prev) => !prev)
              }}
            />
            <NetworkSpeedIndicator
              uploadSpeed={networkSpeed.upload}
              downloadSpeed={networkSpeed.download}
            />
          </div>

          <div className="flex items-center gap-2">
            {toolbarControls}

            <Button variant="outline" size="sm" onClick={toggleFullscreen}>
              {isFullscreen ? (
                <IconMinimize className="h-4 w-4" />
              ) : (
                <IconMaximize className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="h-full min-h-0 p-0">{terminalBody}</CardContent>
    </Card>
  )
}
