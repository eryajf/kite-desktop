import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { trackEvent } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent,
}))

import { TerminalProvider, useTerminal } from './terminal-context'

function createStorage() {
  let store: Record<string, string> = {}

  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

vi.stubGlobal('localStorage', createStorage())
vi.stubGlobal('sessionStorage', createStorage())

function TerminalConsumer() {
  const {
    isOpen,
    isMinimized,
    sessions,
    openTerminal,
    openSession,
    closeTerminal,
    minimizeTerminal,
    toggleTerminal,
  } = useTerminal()

  return (
    <div>
      <span data-testid="state">
        {isOpen ? 'open' : 'closed'}/{isMinimized ? 'minimized' : 'expanded'}
      </span>
      <span data-testid="sessions">
        {sessions
          .map((session) => `${session.id}|${session.clusterName}`)
          .join(',')}
      </span>
      <button type="button" onClick={() => openTerminal()}>
        open
      </button>
      <button
        type="button"
        onClick={() =>
          openSession({
            type: 'pod',
            namespace: 'default',
            podName: 'web-abc',
            containerName: 'nginx',
          })
        }
      >
        open pod
      </button>
      <button type="button" onClick={closeTerminal}>
        close
      </button>
      <button type="button" onClick={minimizeTerminal}>
        minimize
      </button>
      <button type="button" onClick={() => toggleTerminal()}>
        toggle
      </button>
    </div>
  )
}

describe('TerminalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('drives the terminal state through its public actions', async () => {
    render(
      <TerminalProvider>
        <TerminalConsumer />
      </TerminalProvider>
    )

    expect(screen.getByTestId('state')).toHaveTextContent('closed/expanded')

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('open/expanded')
    })
    expect(trackEvent).toHaveBeenCalledWith('kubectl_terminal_open', {
      runtime: 'desktop',
      entry: 'button',
      page: 'overview',
      type: 'kubectl',
      source: 'global',
    })

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('open/minimized')
    })
    expect(trackEvent).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('open/expanded')
    })
    expect(trackEvent).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('closed/expanded')
    })
  })

  it('freezes the current cluster on new sessions', async () => {
    localStorage.setItem('current-cluster', 'cluster-a')

    render(
      <TerminalProvider>
        <TerminalConsumer />
      </TerminalProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'open pod' }))
    await waitFor(() => {
      expect(screen.getByTestId('sessions')).toHaveTextContent(
        'cluster-a:pod:default:web-abc::nginx|cluster-a'
      )
    })

    localStorage.setItem('current-cluster', 'cluster-b')
    fireEvent.click(screen.getByRole('button', { name: 'open pod' }))
    await waitFor(() => {
      expect(screen.getByTestId('sessions')).toHaveTextContent(
        'cluster-b:pod:default:web-abc::nginx|cluster-b'
      )
    })
  })
})
