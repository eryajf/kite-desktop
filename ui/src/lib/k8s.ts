import * as jsonpath from 'jsonpath'
import { Deployment } from 'kubernetes-types/apps/v1'
import { Container, Pod, Service } from 'kubernetes-types/core/v1'
import { ObjectMeta } from 'kubernetes-types/meta/v1'

import {
  clusterScopeResources,
  CustomResource,
  ResourceType,
} from '@/types/api'
import {
  DeploymentOverviewStatusTone,
  DeploymentOverviewViewModel,
  DeploymentResourceSummaryValue,
  DeploymentStatusType,
  PodStatus,
  SimpleContainer,
} from '@/types/k8s'

import { getAge } from './utils'

// This function retrieves the status of a Pod in Kubernetes.
// @see https://github.com/kubernetes/kubernetes/blob/master/pkg/printers/internalversion/printers.go#L881
export function getPodStatus(pod?: Pod): PodStatus {
  if (!pod || !pod.status) {
    return {
      readyContainers: 0,
      totalContainers: 0,
      reason: 'Unknown',
      restartString: '0',
    }
  }
  let restarts = 0
  let restartableInitContainerRestarts = 0
  let totalContainers = pod.spec?.containers?.length || 0
  let readyContainers = 0
  let lastRestartDate = new Date(0)
  let lastRestartableInitContainerRestartDate = new Date(0)

  const podPhase = pod.status?.phase || 'Unknown'
  let reason = podPhase

  if (pod.status?.reason && pod.status.reason !== '') {
    reason = pod.status.reason
  }

  // If the Pod carries {type:PodScheduled, reason:SchedulingGated}, set reason to 'SchedulingGated'.
  if (pod.status?.conditions) {
    for (const condition of pod.status.conditions) {
      if (
        condition.type === 'PodScheduled' &&
        condition.reason === 'SchedulingGated'
      ) {
        reason = 'SchedulingGated'
      }
    }
  }

  const initContainers = new Map<
    string,
    { name: string; restartPolicy?: string }
  >()
  if (pod.spec?.initContainers) {
    for (const container of pod.spec.initContainers) {
      initContainers.set(container.name, container)
      if (isRestartableInitContainer(container)) {
        totalContainers++
      }
    }
  }

  let initializing = false

  if (pod.status?.initContainerStatuses) {
    for (let i = 0; i < pod.status.initContainerStatuses.length; i++) {
      const container = pod.status.initContainerStatuses[i]
      restarts += container.restartCount || 0

      if (container.lastState?.terminated?.finishedAt) {
        const terminatedDate = new Date(
          container.lastState.terminated.finishedAt
        )
        if (lastRestartDate < terminatedDate) {
          lastRestartDate = terminatedDate
        }
      }

      const initContainer = initContainers.get(container.name)
      if (initContainer && isRestartableInitContainer(initContainer)) {
        restartableInitContainerRestarts += container.restartCount || 0
        if (container.lastState?.terminated?.finishedAt) {
          const terminatedDate = new Date(
            container.lastState.terminated.finishedAt
          )
          if (lastRestartableInitContainerRestartDate < terminatedDate) {
            lastRestartableInitContainerRestartDate = terminatedDate
          }
        }
      }

      if (container.state?.terminated?.exitCode === 0) {
        continue
      } else if (
        initContainer &&
        isRestartableInitContainer(initContainer) &&
        container.started
      ) {
        if (container.ready) {
          readyContainers++
        }
        continue
      } else if (container.state?.terminated) {
        // initialization is failed
        if (!container.state.terminated.reason) {
          if (container.state.terminated.signal) {
            reason = `Init:Signal:${container.state.terminated.signal}`
          } else {
            reason = `Init:ExitCode:${container.state.terminated.exitCode}`
          }
        } else {
          reason = 'Init:' + container.state.terminated.reason
        }
        initializing = true
      } else if (
        container.state?.waiting?.reason &&
        container.state.waiting.reason !== 'PodInitializing'
      ) {
        reason = 'Init:' + container.state.waiting.reason
        initializing = true
      } else {
        reason = `Init:${i}/${pod.spec?.initContainers?.length || 0}`
        initializing = true
      }
      break
    }
  }

  if (!initializing || isPodInitializedConditionTrue(pod.status)) {
    restarts = restartableInitContainerRestarts
    lastRestartDate = lastRestartableInitContainerRestartDate
    let hasRunning = false

    if (pod.status?.containerStatuses) {
      for (let i = pod.status.containerStatuses.length - 1; i >= 0; i--) {
        const container = pod.status.containerStatuses[i]

        restarts += container.restartCount || 0
        if (container.lastState?.terminated?.finishedAt) {
          const terminatedDate = new Date(
            container.lastState.terminated.finishedAt
          )
          if (lastRestartDate < terminatedDate) {
            lastRestartDate = terminatedDate
          }
        }

        if (container.state?.waiting?.reason) {
          reason = container.state.waiting.reason
        } else if (container.state?.terminated?.reason) {
          reason = container.state.terminated.reason
        } else if (
          container.state?.terminated &&
          !container.state.terminated.reason
        ) {
          if (container.state.terminated.signal) {
            reason = `Signal:${container.state.terminated.signal}`
          } else {
            reason = `ExitCode:${container.state.terminated.exitCode}`
          }
        } else if (container.ready && container.state?.running) {
          hasRunning = true
          readyContainers++
        }
      }
    }

    if (reason === 'Completed' && hasRunning) {
      if (hasPodReadyCondition(pod.status?.conditions)) {
        reason = 'Running'
      } else {
        reason = 'NotReady'
      }
    }
  }

  if (pod.metadata?.deletionTimestamp && pod.status?.reason === 'NodeLost') {
    reason = 'Unknown'
  } else if (pod.metadata?.deletionTimestamp && !isPodPhaseTerminal(podPhase)) {
    reason = 'Terminating'
  }

  let restartsStr = restarts.toString()
  if (restarts !== 0 && lastRestartDate.getTime() > 0) {
    restartsStr = `${restarts} (${getAge(lastRestartDate.toString())})`
  }

  return {
    readyContainers,
    totalContainers,
    reason,
    restartString: restartsStr,
  }
}

// Helper function to check if pod phase is terminal
function isPodPhaseTerminal(phase: string): boolean {
  return phase === 'Failed' || phase === 'Succeeded'
}

export function getPodErrorMessage(pod: Pod): string | undefined {
  if (!pod.status || !pod.status.containerStatuses) {
    return undefined
  }
  if (pod.status.phase === 'Running' || pod.status.phase === 'Succeeded') {
    return ''
  }
  if (pod.status.containerStatuses.length === 0) {
    return ''
  }

  for (const container of pod.status.containerStatuses) {
    if (container.state?.waiting?.reason !== '') {
      return container.state?.waiting?.message || ''
    }
    if (container.state?.terminated?.reason !== '') {
      return container.state?.terminated?.message || ''
    }
    if (container.state?.terminated?.signal) {
      return `Signal: ${container.state.terminated.signal}`
    }
    if (container.state?.terminated?.exitCode !== 0) {
      return `ExitCode: ${container.state.terminated.exitCode}`
    }
  }

  return undefined
}

export function getPrinterColumnValue(
  resource: CustomResource,
  jsonPath: string
) {
  const queryPath = jsonPath.startsWith('$')
    ? jsonPath
    : jsonPath.startsWith('.')
      ? `$${jsonPath}`
      : `$.${jsonPath}`
  const values = jsonpath
    .query(resource, queryPath)
    .filter((value) => value !== undefined && value !== null)

  if (values.length === 0) {
    return undefined
  }

  if (values.length === 1) {
    return values[0]
  }

  return values.join(', ')
}

export function getDeploymentStatus(
  deployment: Deployment
): DeploymentStatusType {
  if (!deployment.status) {
    return 'Unknown'
  }

  const status = deployment.status
  const spec = deployment.spec

  // Check if deployment is being deleted
  if (deployment.metadata?.deletionTimestamp) {
    return 'Terminating'
  }

  // Check if deployment is paused
  if (spec?.paused) {
    return 'Paused'
  }

  // Get replica counts
  const replicas = status.replicas || 0
  if (replicas === 0) {
    return 'Scaled Down'
  }
  const desiredReplicas = spec?.replicas || 0
  const actualReplicas = status.replicas || 0
  const availableReplicas = status.availableReplicas || 0
  const readyReplicas = status.readyReplicas || 0

  if (desiredReplicas !== actualReplicas) {
    return 'Progressing'
  }
  if (availableReplicas != actualReplicas || readyReplicas != actualReplicas) {
    return 'Progressing'
  }

  // All replicas are ready and available
  if (
    readyReplicas === desiredReplicas &&
    availableReplicas === desiredReplicas
  ) {
    return 'Available'
  }

  return 'Unknown'
}

const binaryMemoryUnits: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
}

const decimalUnits: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
}

function parseCpuQuantity(value?: string): number | undefined {
  if (!value) {
    return undefined
  }

  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)(n|u|m|k|M|G|T|P|E)?$/)
  if (!match) {
    return undefined
  }

  const amount = Number(match[1])
  const suffix = match[2] ?? ''
  if (Number.isNaN(amount) || !(suffix in decimalUnits)) {
    return undefined
  }

  return Math.round(amount * decimalUnits[suffix] * 1000)
}

function formatCpuQuantity(millicores?: number): string | undefined {
  if (millicores === undefined) {
    return undefined
  }

  if (millicores % 1000 === 0) {
    return String(millicores / 1000)
  }

  return `${millicores}m`
}

function parseMemoryQuantity(value?: string): number | undefined {
  if (!value) {
    return undefined
  }

  const match = value
    .trim()
    .match(/^([+-]?\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/)
  if (!match) {
    return undefined
  }

  const amount = Number(match[1])
  const suffix = match[2] ?? ''
  if (Number.isNaN(amount)) {
    return undefined
  }

  if (suffix in binaryMemoryUnits) {
    return Math.round(amount * binaryMemoryUnits[suffix])
  }

  if (suffix in decimalUnits) {
    return Math.round(amount * decimalUnits[suffix])
  }

  return Math.round(amount)
}

function formatMemoryQuantity(bytes?: number): string | undefined {
  if (bytes === undefined) {
    return undefined
  }

  const orderedUnits = Object.entries(binaryMemoryUnits).sort(
    (a, b) => b[1] - a[1]
  )

  for (const [suffix, unitValue] of orderedUnits) {
    if (bytes >= unitValue && bytes % unitValue === 0) {
      return `${bytes / unitValue}${suffix}`
    }
  }

  return `${bytes}`
}

function sumResourceValues(
  containers: Container[] | undefined,
  key: 'requests' | 'limits',
  resource: 'cpu' | 'memory'
): number | undefined {
  if (!containers?.length) {
    return undefined
  }

  let total = 0
  let hasValue = false

  containers.forEach((container) => {
    const value = container.resources?.[key]?.[resource]
    const parsed =
      resource === 'cpu' ? parseCpuQuantity(value) : parseMemoryQuantity(value)

    if (parsed !== undefined) {
      total += parsed
      hasValue = true
    }
  })

  return hasValue ? total : undefined
}

export function aggregateContainerResources(containers?: Container[]): {
  requests: DeploymentResourceSummaryValue
  limits: DeploymentResourceSummaryValue
} {
  return {
    requests: {
      cpu: formatCpuQuantity(sumResourceValues(containers, 'requests', 'cpu')),
      memory: formatMemoryQuantity(
        sumResourceValues(containers, 'requests', 'memory')
      ),
    },
    limits: {
      cpu: formatCpuQuantity(sumResourceValues(containers, 'limits', 'cpu')),
      memory: formatMemoryQuantity(
        sumResourceValues(containers, 'limits', 'memory')
      ),
    },
  }
}

function getDeploymentStatusTone(
  status: DeploymentStatusType
): DeploymentOverviewStatusTone {
  switch (status) {
    case 'Available':
      return 'success'
    case 'Progressing':
    case 'Paused':
      return 'warning'
    case 'Terminating':
    case 'Not Available':
      return 'danger'
    case 'Scaled Down':
    case 'Unknown':
    default:
      return 'muted'
  }
}

export function buildDeploymentOverviewViewModel(
  deployment: Deployment
): DeploymentOverviewViewModel {
  const status = getDeploymentStatus(deployment)
  const containers = deployment.spec?.template?.spec?.containers
  const resources = aggregateContainerResources(containers)
  const generation = deployment.metadata?.generation
  const observedGeneration = deployment.status?.observedGeneration
  const createdAt = deployment.metadata?.creationTimestamp

  return {
    status,
    statusTone: getDeploymentStatusTone(status),
    readyReplicas: deployment.status?.readyReplicas || 0,
    specReplicas: deployment.spec?.replicas || 0,
    updatedReplicas: deployment.status?.updatedReplicas || 0,
    availableReplicas: deployment.status?.availableReplicas || 0,
    observedGeneration,
    generation,
    isObserved:
      generation === undefined ||
      observedGeneration === undefined ||
      observedGeneration >= generation,
    createdAt,
    age: createdAt ? getAge(createdAt) : undefined,
    strategy: deployment.spec?.strategy?.type || 'RollingUpdate',
    hostNetwork: deployment.spec?.template?.spec?.hostNetwork === true,
    schedulerName: deployment.spec?.template?.spec?.schedulerName,
    resourceRequests: resources.requests,
    resourceLimits: resources.limits,
    selectorLabels: deployment.spec?.selector?.matchLabels || {},
    revision:
      deployment.metadata?.annotations?.['deployment.kubernetes.io/revision'],
    serviceLinksEnabled:
      deployment.spec?.template?.spec?.enableServiceLinks !== false,
    labels: deployment.metadata?.labels || {},
    annotations: deployment.metadata?.annotations || {},
  }
}

export function isStandardK8sResource(kind: string): boolean {
  const standardK8sResources = [
    'pods',
    'deployments',
    'statefulsets',
    'daemonsets',
    'replicasets',
    'jobs',
    'cronjobs',
    'services',
    'configmaps',
    'secrets',
    'persistentvolumeclaims',
    'persistentvolumes',
    'ingresses',
    'networkpolicies',
    'namespaces',
    'nodes',
    'events',
    'storageclasses',
  ]
  const resourcePath = kind.toLowerCase() + 's'
  return (
    standardK8sResources.includes(kind) ||
    standardK8sResources.includes(resourcePath)
  )
}

export function getCRDResourcePath(
  kind: string,
  apiVersion: string,
  namespace?: string,
  name?: string
): string {
  const group = apiVersion.includes('/') ? apiVersion.split('/')[0] : ''
  return `/crds/${kind}.${group}/${namespace}/${name}`
}

// Get owner reference information for a pod
export function getOwnerInfo(metadata?: ObjectMeta) {
  if (!metadata) {
    return null
  }
  const ownerRefs = metadata.ownerReferences
  if (!ownerRefs || ownerRefs.length === 0) {
    return null
  }

  const ownerRef = ownerRefs[0]

  const resourcePath = ownerRef.kind.toLowerCase() + 's'
  if (isStandardK8sResource(ownerRef.kind)) {
    const clusterScope = clusterScopeResources.includes(
      resourcePath as ResourceType
    )
    return {
      kind: ownerRef.kind,
      name: ownerRef.name,
      path: `/${resourcePath}${clusterScope ? '' : `/${metadata.namespace}`}/${ownerRef.name}`,
      controller: ownerRef.controller || false,
    }
  } else {
    const apiVersion = ownerRef.apiVersion || ''
    const group = apiVersion.includes('/') ? apiVersion.split('/')[0] : ''
    return {
      kind: ownerRef.kind,
      name: ownerRef.name,
      path: `/crds/${ownerRef.kind.toLowerCase()}s.${group}/${metadata.namespace}/${ownerRef.name}`,
      controller: ownerRef.controller || false,
    }
  }
}

// @see https://github.com/kubernetes/kubernetes/blob/bd44685eadc64c8cd46a8259f027f57ba9724a85/pkg/printers/internalversion/printers.go#L1317-L1347
export function getServiceExternalIP(service: Service): string {
  switch (service.spec?.type) {
    case 'LoadBalancer':
      if (service.status?.loadBalancer?.ingress) {
        const ingress = service.status.loadBalancer.ingress
        if (ingress.length > 0) {
          return ingress.map((i) => i.ip || i.hostname).join(', ')
        }
      }
      return '<pending>'
    case 'ExternalName':
      return service.spec.externalName || '-'
    case 'NodePort':
    case 'ClusterIP':
      if (service.spec.externalIPs && service.spec.externalIPs.length > 0) {
        return service.spec.externalIPs.join(', ')
      }
      return '-'
    default:
      return '-'
  }
}

// Helper function to check if pod has ready condition
function hasPodReadyCondition(conditions?: Array<{ type?: string }>): boolean {
  return conditions?.some((condition) => condition.type === 'Ready') ?? false
}

// Helper function to check if pod is initialized
function isPodInitializedConditionTrue(status: Pod['status']): boolean {
  return (
    status?.conditions?.some(
      (condition) =>
        condition.type === 'Initialized' && condition.status === 'True'
    ) ?? false
  )
}

// Helper function to check if container is restartable init container
function isRestartableInitContainer(container: {
  restartPolicy?: string
}): boolean {
  return container.restartPolicy === 'Always'
}

export function toSimpleContainer(
  initContainers?: Container[],
  containers?: Container[]
): SimpleContainer {
  return [
    ...(containers || []).map((container) => ({
      name: container.name,
      image: container.image || '',
    })),
    ...(initContainers || []).map((container) => ({
      name: container.name,
      image: container.image || '',
      init: true,
    })),
  ]
}
