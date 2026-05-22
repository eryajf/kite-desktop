import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Pod } from 'kubernetes-types/core/v1'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Terminal } from './terminal-content'

const websocketUrls: string[] = []

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    loadAddon = vi.fn()
    open = vi.fn()
    writeln = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    onData = vi.fn()
    refresh = vi.fn()
    element = {
      style: {},
      addEventListener: vi.fn(),
    }
    rows = 24
    cols = 80
    options: Record<string, unknown> = {}
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
    proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }))
  },
}))

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {},
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {},
}))

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, string>) =>
        options?.name ? `${key}:${options.name}` : key,
    }),
  }
})

vi.mock('@/lib/desktop-preferences', () => ({
  loadViewerPreference: vi.fn().mockResolvedValue({
    terminal: {
      theme: 'classic',
      cursorStyle: 'bar',
      fontSize: 14,
    },
  }),
  updateViewerPreference: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./pod-terminal-file-tree', () => ({
  PodTerminalFileTree: () => (
    <aside data-testid="pod-terminal-file-tree">pod file tree</aside>
  ),
}))

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

class WebSocketMock {
  static OPEN = 1
  readyState = WebSocketMock.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(url: string) {
    websocketUrls.push(url)
    setTimeout(() => this.onopen?.(), 0)
  }

  send() {}
  close() {}
}

beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver
  globalThis.WebSocket = WebSocketMock as unknown as typeof WebSocket
})

const pods = [
  {
    metadata: {
      name: 'web-abc',
      uid: 'pod-1',
    },
  },
] as Pod[]

describe('Terminal', () => {
  beforeEach(() => {
    websocketUrls.length = 0
    localStorage.clear()
  })

  it('shows a pod file tree toggle for pod terminals', () => {
    render(
      <Terminal
        type="pod"
        namespace="default"
        podName="web-abc"
        pods={pods}
        containers={[{ name: 'nginx', image: 'nginx:latest' }]}
      />
    )

    const toggle = screen.getByRole('button', {
      name: 'terminalContent.toggleFileTree',
    })
    fireEvent.click(toggle)

    expect(screen.getByTestId('pod-terminal-file-tree')).toBeInTheDocument()
  })

  it('does not show the pod file tree toggle for node terminals', () => {
    render(<Terminal type="node" nodeName="node-a" />)

    expect(
      screen.queryByRole('button', {
        name: 'terminalContent.toggleFileTree',
      })
    ).not.toBeInTheDocument()
  })

  it('uses the frozen session cluster for websocket connections', async () => {
    localStorage.setItem('current-cluster', 'cluster-b')

    render(
      <Terminal
        type="pod"
        clusterName="cluster-a"
        namespace="default"
        podName="web-abc"
        containers={[{ name: 'nginx', image: 'nginx:latest' }]}
      />
    )

    await waitFor(() => {
      expect(websocketUrls[0]).toContain('x-cluster-name=cluster-a')
    })
    expect(websocketUrls[0]).not.toContain('cluster-b')
  })
})
