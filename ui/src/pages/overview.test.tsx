import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-cluster', () => ({
  useCluster: () => ({
    clusters: [],
    currentCluster: null,
  }),
}))

vi.mock('@/lib/api', () => ({
  useOverview: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    isError: false,
  }),
  useResourceUsageHistory: () => ({
    data: undefined,
    isLoading: false,
    error: null,
  }),
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
  }
})

vi.mock('@/components/cluster-stats-cards', () => ({
  ClusterStatsCards: () => <div>cluster stats</div>,
}))

vi.mock('@/components/resources-charts', () => ({
  ResourceCharts: () => <div>resource charts</div>,
}))

vi.mock('@/components/recent-events', () => ({
  RecentEvents: () => <div>recent events</div>,
}))

vi.mock('@/components/chart/resource-utilization', () => ({
  default: () => <div>resource utilization</div>,
}))

vi.mock('@/components/chart/network-usage-chart', () => ({
  default: () => <div>network usage</div>,
}))

import { Overview } from './overview'

describe('Overview', () => {
  it('renders an empty state when there are no clusters', () => {
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>
    )

    expect(
      screen.getByText('Please configure a cluster to start using Kite.')
    ).toBeInTheDocument()
  })
})
