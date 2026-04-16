import { Deployment } from 'kubernetes-types/apps/v1'
import { describe, expect, it } from 'vitest'

import type { CustomResource } from '@/types/api'

import {
  aggregateContainerResources,
  buildDeploymentOverviewViewModel,
  getPrinterColumnValue,
} from './k8s'

const resource = {
  apiVersion: 'example.io/v1',
  kind: 'Widget',
  metadata: {
    name: 'example-widget',
    namespace: 'default',
  },
  status: {
    phase: 'Running',
    conditions: [
      { type: 'Synced', status: 'True' },
      { type: 'Ready', status: 'False' },
    ],
    addresses: [
      { value: '10.0.0.1' },
      { value: null },
      {},
      { value: '10.0.0.2' },
    ],
  },
} as CustomResource

describe('getPrinterColumnValue', () => {
  it.each(['.status.phase', 'status.phase', '$.status.phase'])(
    'reads simple additionalPrinterColumns JSONPath values for %s',
    (jsonPath) => {
      expect(getPrinterColumnValue(resource, jsonPath)).toBe('Running')
    }
  )

  it('reads filtered conditions from additionalPrinterColumns JSONPath', () => {
    expect(
      getPrinterColumnValue(
        resource,
        ".status.conditions[?(@.type=='Synced')].status"
      )
    ).toBe('True')

    expect(
      getPrinterColumnValue(
        resource,
        ".status.conditions[?(@.type=='Ready')].status"
      )
    ).toBe('False')
  })

  it('returns undefined when the JSONPath does not match any value', () => {
    expect(
      getPrinterColumnValue(
        resource,
        ".status.conditions[?(@.type=='Healthy')].status"
      )
    ).toBeUndefined()
  })

  it('joins multiple values and skips nullish matches', () => {
    expect(getPrinterColumnValue(resource, '.status.addresses[*].value')).toBe(
      '10.0.0.1, 10.0.0.2'
    )
  })
})

describe('deployment overview helpers', () => {
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'web',
      namespace: 'default',
      creationTimestamp: '2026-04-15T12:00:00.000Z',
      generation: 4,
      labels: {
        app: 'web',
      },
      annotations: {
        'deployment.kubernetes.io/revision': '7',
      },
    },
    spec: {
      replicas: 3,
      strategy: {
        type: 'RollingUpdate',
      },
      selector: {
        matchLabels: {
          app: 'web',
        },
      },
      template: {
        spec: {
          hostNetwork: true,
          schedulerName: 'custom-scheduler',
          enableServiceLinks: false,
          containers: [
            {
              name: 'api',
              image: 'nginx:1.0',
              resources: {
                requests: {
                  cpu: '100m',
                  memory: '128Mi',
                },
                limits: {
                  cpu: '500m',
                  memory: '256Mi',
                },
              },
            },
            {
              name: 'worker',
              image: 'busybox:1.0',
              resources: {
                requests: {
                  cpu: '250m',
                  memory: '256Mi',
                },
                limits: {
                  cpu: '1',
                  memory: '512Mi',
                },
              },
            },
          ],
        },
      },
    },
    status: {
      readyReplicas: 2,
      updatedReplicas: 3,
      availableReplicas: 2,
      observedGeneration: 3,
      replicas: 3,
    },
  } as Deployment

  it('aggregates container resources across regular containers', () => {
    expect(
      aggregateContainerResources(deployment.spec?.template?.spec?.containers)
    ).toEqual({
      requests: {
        cpu: '350m',
        memory: '384Mi',
      },
      limits: {
        cpu: '1500m',
        memory: '768Mi',
      },
    })
  })

  it('builds the deployment overview view model with rollout metadata', () => {
    const overview = buildDeploymentOverviewViewModel(deployment)

    expect(overview.status).toBe('Progressing')
    expect(overview.readyReplicas).toBe(2)
    expect(overview.specReplicas).toBe(3)
    expect(overview.observedGeneration).toBe(3)
    expect(overview.generation).toBe(4)
    expect(overview.isObserved).toBe(false)
    expect(overview.hostNetwork).toBe(true)
    expect(overview.schedulerName).toBe('custom-scheduler')
    expect(overview.revision).toBe('7')
    expect(overview.serviceLinksEnabled).toBe(false)
    expect(overview.resourceRequests.memory).toBe('384Mi')
    expect(overview.resourceLimits.cpu).toBe('1500m')
  })
})
