import { useEffect, useMemo, useState } from 'react'
import { Deployment } from 'kubernetes-types/apps/v1'
import {
  Container,
  ExecAction,
  HTTPGetAction,
  Probe,
  TCPSocketAction,
  Volume,
} from 'kubernetes-types/core/v1'

export type ContainerEditorTab =
  | 'image'
  | 'resources'
  | 'environment'
  | 'mounts'
  | 'probes'

export type ValidationErrors = Record<string, string>
export type ProbeDraftType = 'http' | 'tcp' | 'exec'
export type RemoveVolumeResult =
  | { ok: true }
  | { ok: false; volumeName: string; referencedBy: string[] }

type UseDeploymentContainerEditorOptions = {
  deployment: Deployment
  open: boolean
  initialContainerName?: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getContainers(deployment: Deployment): Container[] {
  return deployment.spec?.template?.spec?.containers || []
}

function getAllContainers(deployment: Deployment): Container[] {
  return [
    ...(deployment.spec?.template?.spec?.containers || []),
    ...(deployment.spec?.template?.spec?.initContainers || []),
  ]
}

function getVolumes(deployment: Deployment): Volume[] {
  return deployment.spec?.template?.spec?.volumes || []
}

function sanitizeContainer(container: Container): Container {
  const nextContainer = clone(container)

  if (!nextContainer.resources?.requests?.cpu) {
    delete nextContainer.resources?.requests?.cpu
  }
  if (!nextContainer.resources?.requests?.memory) {
    delete nextContainer.resources?.requests?.memory
  }
  if (!nextContainer.resources?.limits?.cpu) {
    delete nextContainer.resources?.limits?.cpu
  }
  if (!nextContainer.resources?.limits?.memory) {
    delete nextContainer.resources?.limits?.memory
  }
  if (
    nextContainer.resources?.requests &&
    Object.keys(nextContainer.resources.requests).length === 0
  ) {
    delete nextContainer.resources.requests
  }
  if (
    nextContainer.resources?.limits &&
    Object.keys(nextContainer.resources.limits).length === 0
  ) {
    delete nextContainer.resources.limits
  }
  if (
    nextContainer.resources &&
    Object.keys(nextContainer.resources).length === 0
  ) {
    delete nextContainer.resources
  }

  if (nextContainer.env?.length === 0) {
    delete nextContainer.env
  }
  if (nextContainer.envFrom?.length === 0) {
    delete nextContainer.envFrom
  }
  if (nextContainer.volumeMounts?.length === 0) {
    delete nextContainer.volumeMounts
  }

  return nextContainer
}

function sanitizeVolumes(volumes: Volume[]): Volume[] {
  return volumes.map((volume) => {
    const nextVolume = clone(volume)

    if (nextVolume.emptyDir) {
      if (!nextVolume.emptyDir.medium) {
        delete nextVolume.emptyDir.medium
      }
      if (!nextVolume.emptyDir.sizeLimit) {
        delete nextVolume.emptyDir.sizeLimit
      }
    }

    return nextVolume
  })
}

function getDefaultProbeFields(probe?: Probe) {
  return {
    initialDelaySeconds: probe?.initialDelaySeconds ?? 0,
    periodSeconds: probe?.periodSeconds ?? 10,
    timeoutSeconds: probe?.timeoutSeconds ?? 1,
    successThreshold: probe?.successThreshold ?? 1,
    failureThreshold: probe?.failureThreshold ?? 3,
  }
}

export function getProbeDraftType(probe?: Probe): ProbeDraftType {
  if (probe?.tcpSocket) {
    return 'tcp'
  }
  if (probe?.exec) {
    return 'exec'
  }
  return 'http'
}

export function createProbeDraft(
  type: ProbeDraftType,
  currentProbe?: Probe
): Probe {
  const base = getDefaultProbeFields(currentProbe)

  if (type === 'tcp') {
    const tcpSocket: TCPSocketAction = {
      port: currentProbe?.tcpSocket?.port || 80,
    }
    return { ...base, tcpSocket }
  }

  if (type === 'exec') {
    const exec: ExecAction = {
      command: currentProbe?.exec?.command?.length
        ? currentProbe.exec.command
        : ['/bin/sh', '-c', 'true'],
    }
    return { ...base, exec }
  }

  const httpGet: HTTPGetAction = {
    path: currentProbe?.httpGet?.path || '/',
    port: currentProbe?.httpGet?.port || 80,
  }
  return { ...base, httpGet }
}

function isValidCPUQuantity(value: string): boolean {
  return /^([+-]?\d+(?:\.\d+)?)(n|u|m|k|M|G|T|P|E)?$/.test(value)
}

function isValidMemoryQuantity(value: string): boolean {
  return /^([+-]?\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/.test(value)
}

function validateProbe(
  errors: ValidationErrors,
  containerPath: string,
  probeKey: 'livenessProbe' | 'readinessProbe' | 'startupProbe',
  probe?: Probe
) {
  if (!probe) {
    return
  }

  const probePath = `${containerPath}.${probeKey}`

  if (probe.httpGet) {
    if (
      probe.httpGet.port === undefined ||
      probe.httpGet.port === null ||
      String(probe.httpGet.port).trim() === ''
    ) {
      errors[`${probePath}.httpGet.port`] = 'Port is required'
    }
    return
  }

  if (probe.tcpSocket) {
    if (
      probe.tcpSocket.port === undefined ||
      probe.tcpSocket.port === null ||
      String(probe.tcpSocket.port).trim() === ''
    ) {
      errors[`${probePath}.tcpSocket.port`] = 'Port is required'
    }
    return
  }

  if (!probe.exec?.command?.some((item) => item.trim() !== '')) {
    errors[`${probePath}.exec.command`] = 'Command is required'
  }
}

export function validateDeploymentContainerDraft(
  deployment: Deployment
): ValidationErrors {
  const errors: ValidationErrors = {}
  const containers = getContainers(deployment)
  const volumes = getVolumes(deployment)
  const volumeNames = new Set<string>()
  const allContainers = getAllContainers(deployment)

  containers.forEach((container, containerIndex) => {
    const containerPath = `containers.${containerIndex}`

    if (!container.image?.trim()) {
      errors[`${containerPath}.image`] = 'Image is required'
    }

    const cpuRequest = container.resources?.requests?.cpu
    if (cpuRequest && !isValidCPUQuantity(cpuRequest)) {
      errors[`${containerPath}.resources.requests.cpu`] = 'Invalid CPU quantity'
    }

    const memoryRequest = container.resources?.requests?.memory
    if (memoryRequest && !isValidMemoryQuantity(memoryRequest)) {
      errors[`${containerPath}.resources.requests.memory`] =
        'Invalid memory quantity'
    }

    const cpuLimit = container.resources?.limits?.cpu
    if (cpuLimit && !isValidCPUQuantity(cpuLimit)) {
      errors[`${containerPath}.resources.limits.cpu`] = 'Invalid CPU quantity'
    }

    const memoryLimit = container.resources?.limits?.memory
    if (memoryLimit && !isValidMemoryQuantity(memoryLimit)) {
      errors[`${containerPath}.resources.limits.memory`] =
        'Invalid memory quantity'
    }

    container.env?.forEach((env, envIndex) => {
      if (!env.name?.trim()) {
        errors[`${containerPath}.env.${envIndex}.name`] = 'Name is required'
      }
    })

    container.envFrom?.forEach((source, sourceIndex) => {
      if (
        !source.configMapRef?.name?.trim() &&
        !source.secretRef?.name?.trim()
      ) {
        errors[`${containerPath}.envFrom.${sourceIndex}.name`] =
          'Source name is required'
      }
    })

    container.volumeMounts?.forEach((mount, mountIndex) => {
      if (!mount.name?.trim()) {
        errors[`${containerPath}.volumeMounts.${mountIndex}.name`] =
          'Volume is required'
      }
      if (!mount.mountPath?.trim()) {
        errors[`${containerPath}.volumeMounts.${mountIndex}.mountPath`] =
          'Mount path is required'
      }
    })

    validateProbe(
      errors,
      containerPath,
      'livenessProbe',
      container.livenessProbe
    )
    validateProbe(
      errors,
      containerPath,
      'readinessProbe',
      container.readinessProbe
    )
    validateProbe(errors, containerPath, 'startupProbe', container.startupProbe)
  })

  volumes.forEach((volume, volumeIndex) => {
    const volumePath = `volumes.${volumeIndex}`
    const name = volume.name?.trim()

    if (!name) {
      errors[`${volumePath}.name`] = 'Volume name is required'
      return
    }

    if (volumeNames.has(name)) {
      errors[`${volumePath}.name`] = 'Volume name must be unique'
    }
    volumeNames.add(name)

    if (volume.configMap && !volume.configMap.name?.trim()) {
      errors[`${volumePath}.configMap.name`] = 'ConfigMap name is required'
    }
    if (volume.secret && !volume.secret.secretName?.trim()) {
      errors[`${volumePath}.secret.secretName`] = 'Secret name is required'
    }
    if (
      volume.persistentVolumeClaim &&
      !volume.persistentVolumeClaim.claimName?.trim()
    ) {
      errors[`${volumePath}.persistentVolumeClaim.claimName`] =
        'PVC name is required'
    }
    if (volume.hostPath && !volume.hostPath.path?.trim()) {
      errors[`${volumePath}.hostPath.path`] = 'Host path is required'
    }
  })

  allContainers.forEach((container, containerIndex) => {
    container.volumeMounts?.forEach((mount, mountIndex) => {
      if (mount.name?.trim() && !volumeNames.has(mount.name.trim())) {
        errors[`mountRefs.${containerIndex}.${mountIndex}`] =
          'Referenced volume does not exist'
      }
    })
  })

  return errors
}

export function useDeploymentContainerEditor({
  deployment,
  open,
  initialContainerName,
}: UseDeploymentContainerEditorOptions) {
  const [draftDeployment, setDraftDeployment] = useState<Deployment>(() =>
    clone(deployment)
  )
  const [selectedContainerName, setSelectedContainerName] = useState(
    initialContainerName || getContainers(deployment)[0]?.name || ''
  )
  const [activeTab, setActiveTab] = useState<ContainerEditorTab>('image')
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})

  useEffect(() => {
    if (!open) {
      return
    }

    const nextDraft = clone(deployment)
    const nextContainers = getContainers(nextDraft)
    const nextSelectedContainer =
      nextContainers.find(
        (container) => container.name === initialContainerName
      )?.name ||
      nextContainers[0]?.name ||
      ''

    setDraftDeployment(nextDraft)
    setSelectedContainerName(nextSelectedContainer)
    setActiveTab('image')
    setValidationErrors({})
  }, [deployment, initialContainerName, open])

  const containers = useMemo(
    () => getContainers(draftDeployment),
    [draftDeployment]
  )
  const volumes = useMemo(() => getVolumes(draftDeployment), [draftDeployment])
  const selectedContainerIndex = useMemo(
    () =>
      containers.findIndex(
        (container) => container.name === selectedContainerName
      ),
    [containers, selectedContainerName]
  )
  const selectedContainer =
    containers[selectedContainerIndex] || containers[0] || undefined

  const isDirty = useMemo(
    () => JSON.stringify(draftDeployment) !== JSON.stringify(deployment),
    [deployment, draftDeployment]
  )

  const updateSelectedContainer = (updates: Partial<Container>) => {
    if (!selectedContainer) {
      return
    }

    setDraftDeployment((currentDeployment) => {
      const nextDraft = clone(currentDeployment)
      const nextContainers = getContainers(nextDraft)
      const containerIndex = nextContainers.findIndex(
        (container) => container.name === selectedContainer.name
      )

      if (containerIndex < 0) {
        return currentDeployment
      }

      nextContainers[containerIndex] = sanitizeContainer({
        ...nextContainers[containerIndex],
        ...updates,
      })
      nextDraft.spec!.template!.spec!.containers = nextContainers
      return nextDraft
    })
  }

  const updateVolumes = (nextVolumes: Volume[]) => {
    setDraftDeployment((currentDeployment) => {
      const nextDraft = clone(currentDeployment)
      nextDraft.spec!.template!.spec!.volumes = sanitizeVolumes(nextVolumes)
      return nextDraft
    })
  }

  const removeVolume = (volumeName: string) => {
    const referencedBy = getAllContainers(draftDeployment).filter((container) =>
      container.volumeMounts?.some((mount) => mount.name === volumeName)
    )

    if (referencedBy.length > 0) {
      return {
        ok: false as const,
        volumeName,
        referencedBy: referencedBy.map((container) => container.name),
      }
    }

    updateVolumes(volumes.filter((volume) => volume.name !== volumeName))
    return { ok: true as const }
  }

  const validate = () => {
    const errors = validateDeploymentContainerDraft(draftDeployment)
    setValidationErrors(errors)
    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    }
  }

  const reset = () => {
    setDraftDeployment(clone(deployment))
    setSelectedContainerName(
      initialContainerName || getContainers(deployment)[0]?.name || ''
    )
    setActiveTab('image')
    setValidationErrors({})
  }

  const hasTabErrors = (tab: ContainerEditorTab) => {
    if (selectedContainerIndex < 0) {
      return false
    }

    const tabPrefixes: Record<ContainerEditorTab, string[]> = {
      image: [`containers.${selectedContainerIndex}.image`],
      resources: [
        `containers.${selectedContainerIndex}.resources.requests`,
        `containers.${selectedContainerIndex}.resources.limits`,
      ],
      environment: [
        `containers.${selectedContainerIndex}.env.`,
        `containers.${selectedContainerIndex}.envFrom.`,
      ],
      mounts: [
        `containers.${selectedContainerIndex}.volumeMounts.`,
        'volumes.',
        'mountRefs.',
      ],
      probes: [
        `containers.${selectedContainerIndex}.livenessProbe`,
        `containers.${selectedContainerIndex}.readinessProbe`,
        `containers.${selectedContainerIndex}.startupProbe`,
      ],
    }

    return Object.keys(validationErrors).some((errorKey) =>
      tabPrefixes[tab].some((prefix) => errorKey.startsWith(prefix))
    )
  }

  return {
    activeTab,
    containers,
    draftDeployment,
    isDirty,
    selectedContainer,
    selectedContainerIndex,
    selectedContainerName,
    setActiveTab,
    setSelectedContainerName,
    updateSelectedContainer,
    updateVolumes,
    removeVolume,
    reset,
    validate,
    validationErrors,
    hasTabErrors,
    volumes,
  }
}
