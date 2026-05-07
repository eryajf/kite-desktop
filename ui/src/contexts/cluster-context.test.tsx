import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { trackEvent } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent,
}))

import { ClusterProvider, ClusterContext } from './cluster-context'

function ClusterStateProbe() {
  return (
    <ClusterContext.Consumer>
      {(value) => (
        <div data-testid="cluster-state">
          {value?.currentCluster ?? 'none'}|{String(value?.isLoading)}
        </div>
      )}
    </ClusterContext.Consumer>
  )
}

function ClusterSwitchProbe() {
  return (
    <ClusterContext.Consumer>
      {(value) => (
        <button
          type="button"
          onClick={() => value?.setCurrentCluster('cluster-b')}
        >
          switch
        </button>
      )}
    </ClusterContext.Consumer>
  )
}

function renderClusterProvider() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ClusterStateProbe />
        <ClusterSwitchProbe />
      </ClusterProvider>
    </QueryClientProvider>
  )
}

describe('ClusterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears stale cluster state and does not auto-select when clusters are empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/preferences/workspace')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            currentCluster: '',
            recentClusters: [],
            selectedNamespaceByCluster: {},
          }),
          text: async () =>
            JSON.stringify({
              currentCluster: '',
              recentClusters: [],
              selectedNamespaceByCluster: {},
            }),
        }
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
        text: async () => '[]',
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem('current-cluster', 'stale-cluster')
    const removeItemSpy = vi.spyOn(localStorage, 'removeItem')
    const setItemSpy = vi.spyOn(localStorage, 'setItem')

    renderClusterProvider()

    await waitFor(() =>
      expect(screen.getByTestId('cluster-state')).toHaveTextContent('none|false')
    )

    expect(removeItemSpy).toHaveBeenCalledWith('current-cluster')
    expect(setItemSpy).not.toHaveBeenCalledWith(
      'current-cluster',
      expect.any(String)
    )
  })

  it('tracks a sanitized cluster switch event without leaking the cluster name', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/api/v1/preferences/workspace')) {
        if (init?.method === 'PUT') {
          return {
            ok: true,
            status: 204,
            headers: new Headers(),
            json: async () => ({}),
            text: async () => '',
          }
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            currentCluster: 'cluster-a',
            recentClusters: ['cluster-a'],
            selectedNamespaceByCluster: {},
          }),
          text: async () =>
            JSON.stringify({
              currentCluster: 'cluster-a',
              recentClusters: ['cluster-a'],
              selectedNamespaceByCluster: {},
            }),
        }
      }

      return {
        ok: true,
        status: 200,
        json: async () => [
          { name: 'cluster-a', isDefault: true },
          { name: 'cluster-b', isDefault: false },
        ],
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    renderClusterProvider()

    await waitFor(() =>
      expect(screen.getByTestId('cluster-state')).toHaveTextContent(
        'cluster-a|false'
      )
    )

    await user.click(screen.getByRole('button', { name: 'switch' }))

    expect(trackEvent).toHaveBeenCalledWith('cluster_switch', {
      runtime: 'desktop',
      page: 'overview',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/preferences/workspace'),
      expect.objectContaining({ method: 'PUT' })
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      'cluster_switch',
      expect.objectContaining({ clusterName: 'cluster-b' })
    )
  })
})
