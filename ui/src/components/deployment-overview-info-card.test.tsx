import '@/i18n'

import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DeploymentOverviewViewModel } from '@/types/k8s'
import { formatDate } from '@/lib/utils'

import { DeploymentOverviewInfoCard } from './deployment-overview-info-card'

const overview: DeploymentOverviewViewModel = {
  status: 'Available',
  statusTone: 'success',
  readyReplicas: 1,
  specReplicas: 1,
  updatedReplicas: 1,
  availableReplicas: 1,
  observedGeneration: 1,
  generation: 1,
  isObserved: true,
  strategy: 'RollingUpdate',
  hostNetwork: false,
  resourceRequests: {},
  resourceLimits: {},
  selectorLabels: {},
  serviceLinksEnabled: true,
  labels: {},
  annotations: {},
}

describe('DeploymentOverviewInfoCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a unified empty-state label for unset overview fields', () => {
    void i18n.changeLanguage('en')

    render(
      <DeploymentOverviewInfoCard
        overview={overview}
        containerCount={1}
        onEdit={() => undefined}
      />
    )

    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0)
  })

  it('renders rollout status metrics in the same card', () => {
    void i18n.changeLanguage('en')

    render(
      <DeploymentOverviewInfoCard
        overview={overview}
        containerCount={1}
        onEdit={() => undefined}
      />
    )

    expect(screen.getByTestId('deployment-status')).toHaveTextContent(
      'Available'
    )
    expect(screen.getByTestId('deployment-ready-spec')).toHaveTextContent(
      '1 / 1'
    )
    expect(screen.queryByTestId('deployment-replicas')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('deployment-observed-generation')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('deployment-service-links')
    ).not.toBeInTheDocument()
  })

  it('renders created time in a single line with exact relative age', () => {
    void i18n.changeLanguage('zh')
    const createdAt = '2026-03-05T18:12:05Z'

    render(
      <DeploymentOverviewInfoCard
        overview={{
          ...overview,
          createdAt,
        }}
        containerCount={1}
        onEdit={() => undefined}
      />
    )

    expect(
      screen.getByText(`${formatDate(createdAt)} (42天前)`)
    ).toBeInTheDocument()
    expect(screen.queryByText(/^1\s*个月前$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^42d$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^42天前$/)).not.toBeInTheDocument()
  })

  it('keeps selector and resource summaries visible together', () => {
    void i18n.changeLanguage('zh')

    render(
      <DeploymentOverviewInfoCard
        overview={{
          ...overview,
          selectorLabels: { app: 'ops-whoami' },
          resourceRequests: { cpu: '200m', memory: '100Mi' },
          resourceLimits: { cpu: '500m', memory: '200Mi' },
        }}
        containerCount={1}
        onEdit={() => undefined}
      />
    )

    expect(screen.getByText('选择器')).toBeInTheDocument()
    expect(screen.getByText('资源请求总计')).toBeInTheDocument()
    expect(screen.getByText('资源限制总计')).toBeInTheDocument()
    expect(screen.getByText('app: ops-whoami')).toBeInTheDocument()
    expect(screen.getByText('CPU: 200m')).toBeInTheDocument()
    expect(screen.getByText('CPU: 500m')).toBeInTheDocument()
  })
})
