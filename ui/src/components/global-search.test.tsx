import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GlobalSearch } from './global-search'

const { openSearchMock, globalSearchMock } = vi.hoisted(() => ({
  openSearchMock: vi.fn(),
  globalSearchMock: vi.fn().mockResolvedValue({ results: [] }),
}))
const { trackDesktopEvent, setCurrentClusterMock } = vi.hoisted(() => ({
  trackDesktopEvent: vi.fn(),
  setCurrentClusterMock: vi.fn(),
}))
const clustersMock = [
  {
    id: 1,
    name: 'prod',
    enabled: true,
    inCluster: false,
    isDefault: false,
    createdAt: '',
    updatedAt: '',
    version: 'v1.31.0',
  },
  {
    id: 2,
    name: 'dev',
    enabled: true,
    inCluster: false,
    isDefault: true,
    createdAt: '',
    updatedAt: '',
    version: 'v1.30.0',
  },
]
const favoritesMock: [] = []

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)
Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true,
})

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({
    children,
    heading,
  }: {
    children: React.ReactNode
    heading?: React.ReactNode
  }) => (
    <section>
      {heading ? <h2>{heading}</h2> : null}
      {children}
    </section>
  ),
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder?: string
    value?: string
    onValueChange?: (value: string) => void
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
  CommandItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode
    onSelect?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandShortcut: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

vi.mock('@/lib/api', () => ({
  globalSearch: globalSearchMock,
}))

vi.mock('@/hooks/use-cluster', () => ({
  useCluster: () => ({
    clusters: clustersMock,
    currentCluster: 'prod',
    setCurrentCluster: setCurrentClusterMock,
    isSwitching: false,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-favorites', () => ({
  useFavorites: () => ({
    favorites: favoritesMock,
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}))

vi.mock('@/contexts/runtime-context', () => ({
  useRuntime: () => ({
    isDesktop: true,
  }),
}))

vi.mock('@/lib/analytics', () => ({
  trackDesktopEvent,
}))

vi.mock('@/contexts/sidebar-config-context', () => ({
  useSidebarConfig: () => ({
    config: null,
    getIconComponent: vi.fn(),
  }),
}))

vi.mock('@/components/appearance-provider', () => ({
  useAppearance: () => ({
    actualTheme: 'light',
    setTheme: vi.fn(),
  }),
}))

vi.mock('./global-search-provider', () => ({
  useGlobalSearch: () => ({
    openSearch: openSearchMock,
  }),
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (_key: string, fallback?: string, options?: { name?: string }) => {
        if (options?.name) {
          return `Switch to cluster ${options.name}`
        }
        return fallback ?? _key
      },
    }),
  }
})

describe('GlobalSearch', () => {
  beforeEach(() => {
    openSearchMock.mockClear()
    globalSearchMock.mockClear()
    trackDesktopEvent.mockClear()
    setCurrentClusterMock.mockClear()
  })

  it('shows quick actions in all mode and can jump into cluster mode', () => {
    render(
      <MemoryRouter>
        <GlobalSearch open mode="all" onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('globalSearch.switchClusterMode'))

    expect(openSearchMock).toHaveBeenCalledWith('cluster')
    expect(trackDesktopEvent).toHaveBeenCalledWith('global_search_select', {
      mode: 'all',
      item_type: 'action',
      action_id: 'switch-cluster-mode',
    })
  })

  it('shows cluster results locally in cluster mode without calling resource search', async () => {
    render(
      <MemoryRouter>
        <GlobalSearch open mode="cluster" onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    expect(
      screen.getByPlaceholderText('globalSearch.clusterPlaceholder')
    ).toBeInTheDocument()
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()

    await waitFor(() => {
      expect(globalSearchMock).not.toHaveBeenCalled()
    })
  })

  it('filters cluster mode by cluster name only', () => {
    render(
      <MemoryRouter>
        <GlobalSearch open mode="cluster" onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.change(
      screen.getByPlaceholderText('globalSearch.clusterPlaceholder'),
      { target: { value: 'v1.31' } }
    )

    expect(screen.queryByText('prod')).not.toBeInTheDocument()
    expect(screen.queryByText('dev')).not.toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText('globalSearch.clusterPlaceholder'),
      { target: { value: 'pro' } }
    )

    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.queryByText('dev')).not.toBeInTheDocument()
    expect(screen.queryByText('导航')).not.toBeInTheDocument()
    expect(
      screen.queryByText('globalSearch.navigation')
    ).not.toBeInTheDocument()
  })

  it('tracks resource query and selection without sending raw query text', async () => {
    globalSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: 'pod-1',
          name: 'nginx',
          namespace: 'default',
          resourceType: 'pods',
          createdAt: '',
        },
      ],
    })

    render(
      <MemoryRouter>
        <GlobalSearch open mode="all" onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByPlaceholderText('globalSearch.placeholder'), {
      target: { value: 'ng' },
    })

    await waitFor(() => {
      expect(globalSearchMock).toHaveBeenCalledWith('ng', { limit: 10 })
    })

    await waitFor(() => {
      expect(trackDesktopEvent).toHaveBeenCalledWith('global_search_query', {
        mode: 'all',
        query_length: 2,
        result_count: 1,
      })
    })

    fireEvent.click(screen.getByText('nginx'))

    expect(trackDesktopEvent).toHaveBeenCalledWith('global_search_select', {
      mode: 'all',
      item_type: 'resource',
      resource_type: 'pods',
    })

    expect(
      JSON.parse(localStorage.getItem('global-search-history-v1-prod') || '[]')
    ).toEqual([
      expect.objectContaining({
        id: 'resource:/pods/default/nginx',
        label: 'nginx',
        path: '/pods/default/nginx',
        query: 'ng',
        resourceType: 'pods',
        namespace: 'default',
      }),
    ])
  })

  it('tracks cluster selection in cluster mode', async () => {
    render(
      <MemoryRouter>
        <GlobalSearch open mode="cluster" onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('dev'))

    await waitFor(() => {
      expect(setCurrentClusterMock).toHaveBeenCalledWith('dev')
    })

    expect(trackDesktopEvent).toHaveBeenCalledWith('global_search_select', {
      mode: 'cluster',
      item_type: 'cluster',
    })
  })

  it('shows the current cluster search history in reverse chronological order', () => {
    localStorage.setItem(
      'global-search-history-v1-prod',
      JSON.stringify([
        {
          id: 'resource:/pods/default/older',
          type: 'resource',
          label: 'older',
          path: '/pods/default/older',
          query: 'old',
          resourceType: 'pods',
          namespace: 'default',
          lastAccessedAt: '2026-04-24T10:00:00.000Z',
        },
        {
          id: 'resource:/pods/default/newer',
          type: 'resource',
          label: 'newer',
          path: '/pods/default/newer',
          query: 'new',
          resourceType: 'pods',
          namespace: 'default',
          lastAccessedAt: '2026-04-24T11:00:00.000Z',
        },
      ])
    )

    render(
      <MemoryRouter>
        <GlobalSearch open mode="all" onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByText('globalSearch.history')).toBeInTheDocument()

    const historyButtons = screen
      .getAllByRole('button')
      .filter(
        (button) =>
          button.textContent?.includes('older') ||
          button.textContent?.includes('newer')
      )

    expect(historyButtons).toHaveLength(2)
    expect(historyButtons[0]).toHaveTextContent('newer')
    expect(historyButtons[1]).toHaveTextContent('older')
  })
})
