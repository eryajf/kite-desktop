export type DeploymentStatusType =
  | 'Unknown'
  | 'Paused'
  | 'Scaled Down'
  | 'Not Available'
  | 'Progressing'
  | 'Terminating'
  | 'Available'

export type PodStatus = {
  readyContainers: number
  totalContainers: number
  reason: string
  restartString: string
}

export type SimpleContainer = Array<{
  name: string
  image: string
  init?: boolean
}>

export type DeploymentOverviewStatusTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'

export type DeploymentResourceSummaryValue = {
  cpu?: string
  memory?: string
}

export type DeploymentOverviewViewModel = {
  status: DeploymentStatusType
  statusTone: DeploymentOverviewStatusTone
  readyReplicas: number
  specReplicas: number
  updatedReplicas: number
  availableReplicas: number
  observedGeneration?: number
  generation?: number
  isObserved: boolean
  createdAt?: string
  age?: string
  strategy: string
  hostNetwork: boolean
  schedulerName?: string
  resourceRequests: DeploymentResourceSummaryValue
  resourceLimits: DeploymentResourceSummaryValue
  selectorLabels: Record<string, string>
  revision?: string
  serviceLinksEnabled: boolean
  labels: Record<string, string>
  annotations: Record<string, string>
}

/**
 * @link https://kubernetes.io/docs/reference/node/node-status/#condition
 */
export type NodeConditionType =
  | 'Ready'
  | 'DiskPressure'
  | 'MemoryPressure'
  | 'PIDPressure'
  | 'NetworkUnavailable'
