import '@/i18n'

import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DaemonSetOverviewViewModel } from '@/types/k8s'
import { formatDate } from '@/lib/utils'

import { DaemonSetOverviewInfoCard } from './daemonset-overview-info-card'

const overview: DaemonSetOverviewViewModel = {
  status: 'Available',
  statusTone: 'success',
  readyScheduled: 3,
  desiredScheduled: 3,
  currentScheduled: 3,
  updatedScheduled: 3,
  availableScheduled: 3,
  misscheduled: 0,
  isObserved: true,
  updateStrategy: 'RollingUpdate',
  minReadySeconds: 0,
  hostNetwork: false,
  resourceRequests: {},
  resourceLimits: {},
  selectorLabels: {},
  serviceLinksEnabled: true,
  labels: {},
  annotations: {},
}

describe('DaemonSetOverviewInfoCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows scheduling status and a unified empty-state label', () => {
    void i18n.changeLanguage('en')

    render(<DaemonSetOverviewInfoCard overview={overview} />)

    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0)
    expect(screen.getByTestId('daemonset-status')).toHaveTextContent(
      'Available'
    )
    expect(screen.getByTestId('daemonset-scheduled-summary')).toHaveTextContent(
      '3 / 3 / 3'
    )
  })

  it('renders created time with exact relative age', () => {
    void i18n.changeLanguage('zh')
    const createdAt = '2026-03-05T18:12:05Z'

    render(
      <DaemonSetOverviewInfoCard
        overview={{
          ...overview,
          createdAt,
        }}
      />
    )

    expect(
      screen.getByText(`${formatDate(createdAt)} (42天前)`)
    ).toBeInTheDocument()
  })

  it('keeps rollout policy, scheduling counters, and resources visible together', () => {
    void i18n.changeLanguage('zh')

    render(
      <DaemonSetOverviewInfoCard
        overview={{
          ...overview,
          selectorLabels: { app: 'node-agent' },
          resourceRequests: { cpu: '100m', memory: '128Mi' },
          resourceLimits: { cpu: '500m', memory: '256Mi' },
          maxUnavailable: '25%',
          maxSurge: 1,
          revisionHistoryLimit: 4,
          collisionCount: 2,
        }}
      />
    )

    expect(screen.getByText('滚动更新策略')).toBeInTheDocument()
    expect(screen.getByText('已更新调度数')).toBeInTheDocument()
    expect(screen.getByText('错误调度数')).toBeInTheDocument()
    expect(screen.getByText('app: node-agent')).toBeInTheDocument()
    expect(screen.getByText('CPU: 100m')).toBeInTheDocument()
    expect(screen.getByText('CPU: 500m')).toBeInTheDocument()
    expect(
      screen.getByText('MaxUnavailable: 25% / MaxSurge: 1')
    ).toBeInTheDocument()
  })
})
