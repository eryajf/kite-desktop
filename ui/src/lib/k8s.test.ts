import { DaemonSet, Deployment, ReplicaSet } from 'kubernetes-types/apps/v1'
import { Pod } from 'kubernetes-types/core/v1'
import { describe, expect, it } from 'vitest'

import type { CustomResource } from '@/types/api'

import {
  aggregateContainerResources,
  buildDeploymentOverviewViewModel,
  filterPodsOwnedByController,
  filterPodsOwnedByDeployment,
  filterReplicaSetsOwnedByDeployment,
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

describe('workload pod ownership helpers', () => {
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'web',
      namespace: 'default',
      uid: 'deploy-1',
    },
  } as Deployment

  const replicaSets = [
    {
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      metadata: {
        name: 'web-abc123',
        namespace: 'default',
        uid: 'rs-1',
        ownerReferences: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: 'web',
            uid: 'deploy-1',
            controller: true,
          },
        ],
      },
    },
    {
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      metadata: {
        name: 'other-def456',
        namespace: 'default',
        uid: 'rs-2',
        ownerReferences: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: 'other',
            uid: 'deploy-2',
            controller: true,
          },
        ],
      },
    },
  ] as ReplicaSet[]

  const pods = [
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'web-abc123-1',
        namespace: 'default',
        ownerReferences: [
          {
            apiVersion: 'apps/v1',
            kind: 'ReplicaSet',
            name: 'web-abc123',
            uid: 'rs-1',
            controller: true,
          },
        ],
      },
    },
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'other-def456-1',
        namespace: 'default',
        ownerReferences: [
          {
            apiVersion: 'apps/v1',
            kind: 'ReplicaSet',
            name: 'other-def456',
            uid: 'rs-2',
            controller: true,
          },
        ],
      },
    },
  ] as Pod[]

  it('keeps only replica sets controlled by the current deployment', () => {
    expect(
      filterReplicaSetsOwnedByDeployment(replicaSets, deployment)?.map(
        (replicaSet) => replicaSet.metadata?.name
      )
    ).toEqual(['web-abc123'])
  })

  it('keeps only pods that belong to replica sets owned by the deployment', () => {
    const ownedReplicaSets = filterReplicaSetsOwnedByDeployment(
      replicaSets,
      deployment
    )

    expect(
      filterPodsOwnedByDeployment(pods, deployment, ownedReplicaSets)?.map(
        (pod) => pod.metadata?.name
      )
    ).toEqual(['web-abc123-1'])
  })

  it('keeps only pods directly controlled by the matching workload', () => {
    const daemonSet = {
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: {
        name: 'agent',
        namespace: 'kube-system',
        uid: 'daemonset-1',
      },
    } as DaemonSet

    const daemonSetPods = [
      {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'agent-node-a',
          namespace: 'kube-system',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'DaemonSet',
              name: 'agent',
              uid: 'daemonset-1',
              controller: true,
            },
          ],
        },
      },
      {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'agent-node-b',
          namespace: 'kube-system',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'DaemonSet',
              name: 'other-agent',
              uid: 'daemonset-2',
              controller: true,
            },
          ],
        },
      },
    ] as Pod[]

    expect(
      filterPodsOwnedByController(daemonSetPods, 'DaemonSet', daemonSet)?.map(
        (pod) => pod.metadata?.name
      )
    ).toEqual(['agent-node-a'])
  })
})
