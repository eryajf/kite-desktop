import '@/i18n'

import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StatefulSetOverviewViewModel } from '@/types/k8s'
import { formatDate } from '@/lib/utils'

import { StatefulSetOverviewInfoCard } from './statefulset-overview-info-card'

const overview: StatefulSetOverviewViewModel = {
  status: 'Available',
  statusTone: 'success',
  readyReplicas: 3,
  specReplicas: 3,
  currentReplicas: 3,
  updatedReplicas: 3,
  availableReplicas: 3,
  isObserved: true,
  updateStrategy: 'RollingUpdate',
  podManagementPolicy: 'OrderedReady',
  minReadySeconds: 0,
  hostNetwork: false,
  resourceRequests: {},
  resourceLimits: {},
  selectorLabels: {},
  serviceLinksEnabled: true,
  labels: {},
  annotations: {},
}

describe('StatefulSetOverviewInfoCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a unified empty-state label for unset overview fields', () => {
    void i18n.changeLanguage('en')

    render(<StatefulSetOverviewInfoCard overview={overview} />)

    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0)
    expect(screen.getByTestId('statefulset-status')).toHaveTextContent(
      'Available'
    )
    expect(screen.getByTestId('statefulset-replica-summary')).toHaveTextContent(
      '3 / 3 / 3'
    )
  })

  it('renders created time in a single line with exact relative age', () => {
    void i18n.changeLanguage('zh')
    const createdAt = '2026-03-05T18:12:05Z'

    render(
      <StatefulSetOverviewInfoCard
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

  it('keeps strategy, revisions, and resource summaries visible together', () => {
    void i18n.changeLanguage('zh')

    render(
      <StatefulSetOverviewInfoCard
        overview={{
          ...overview,
          selectorLabels: { app: 'mysql' },
          resourceRequests: { cpu: '500m', memory: '1Gi' },
          resourceLimits: { cpu: '1', memory: '2Gi' },
          currentRevision: 'mysql-abc',
          updateRevision: 'mysql-def',
          pvcWhenDeleted: 'Retain',
          pvcWhenScaled: 'Delete',
        }}
      />
    )

    expect(screen.getByText('当前修订版本')).toBeInTheDocument()
    expect(screen.getByText('目标修订版本')).toBeInTheDocument()
    expect(screen.getByText('PVC 保留策略')).toBeInTheDocument()
    expect(screen.getByText('app: mysql')).toBeInTheDocument()
    expect(screen.getByText('CPU: 500m')).toBeInTheDocument()
    expect(screen.getByText('CPU: 1')).toBeInTheDocument()
    expect(
      screen.getByText('Deleted: Retain / Scaled: Delete')
    ).toBeInTheDocument()
  })
})
