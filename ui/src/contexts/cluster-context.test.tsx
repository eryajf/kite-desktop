import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

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
      </ClusterProvider>
    </QueryClientProvider>
  )
}

describe('ClusterProvider', () => {
  it('clears stale cluster state and does not auto-select when clusters are empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
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
})
