import '@/i18n'

import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { describe, expect, it } from 'vitest'

import { DeploymentOverviewViewModel } from '@/types/k8s'

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
})
