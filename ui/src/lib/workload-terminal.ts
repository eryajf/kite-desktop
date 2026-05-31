import type { TFunction } from 'i18next'
import type {
  DaemonSet,
  Deployment,
  ReplicaSetList,
  StatefulSet,
} from 'kubernetes-types/apps/v1'
import type { Pod, PodList } from 'kubernetes-types/core/v1'
import { toast } from 'sonner'

import type { TerminalSessionSpec } from '@/contexts/terminal-context'
import { fetchResources } from '@/lib/api'
import {
  filterPodsOwnedByController,
  filterPodsOwnedByDeployment,
} from '@/lib/k8s'

type Workload = Deployment | StatefulSet | DaemonSet
type WorkloadKind = 'Deployment' | 'StatefulSet' | 'DaemonSet'

interface OpenWorkloadTerminalOptions {
  workload: Workload
  kind: WorkloadKind
  sourcePrefix: string
  openSession: (spec: TerminalSessionSpec) => string
  t: TFunction
}

function buildLabelSelector(matchLabels?: Record<string, string>) {
  if (!matchLabels) {
    return undefined
  }

  return Object.entries(matchLabels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
}

function getPreferredPod(pods: Pod[] | undefined) {
  if (!pods?.length) {
    return undefined
  }

  return (
    pods.find((pod) => pod.status?.phase === 'Running') ??
    pods.find((pod) => Boolean(pod.metadata?.name))
  )
}

export async function openWorkloadTerminal({
  workload,
  kind,
  sourcePrefix,
  openSession,
  t,
}: OpenWorkloadTerminalOptions) {
  const name = workload.metadata?.name
  const namespace = workload.metadata?.namespace
  const labelSelector = buildLabelSelector(workload.spec?.selector.matchLabels)
  const source = name ? `${sourcePrefix}/${name}` : sourcePrefix

  if (!name || !namespace || !labelSelector) {
    toast.error(
      t('terminalLauncher.noAvailablePod', {
        source,
        defaultValue: 'No available pod found for {{source}}.',
      })
    )
    return
  }

  try {
    const podList = await fetchResources<PodList>('pods', namespace, {
      labelSelector,
      reduce: false,
    })
    let relatedPods: Pod[] | undefined = podList.items

    if (kind === 'Deployment') {
      const replicaSetList = await fetchResources<ReplicaSetList>(
        'replicasets',
        namespace,
        {
          labelSelector,
          reduce: false,
        }
      )
      relatedPods = filterPodsOwnedByDeployment(
        podList.items,
        workload as Deployment,
        replicaSetList.items
      )
    } else {
      relatedPods = filterPodsOwnedByController(podList.items, kind, workload)
    }

    const pod = getPreferredPod(relatedPods)
    const podName = pod?.metadata?.name

    if (!podName) {
      toast.error(
        t('terminalLauncher.noAvailablePod', {
          source,
          defaultValue: 'No available pod found for {{source}}.',
        })
      )
      return
    }

    openSession({
      type: 'pod',
      namespace,
      podName,
      pods: relatedPods,
      containers: workload.spec?.template.spec?.containers,
      initContainers: workload.spec?.template.spec?.initContainers,
      source,
      title: `${source} · ${podName}`,
      subtitle: namespace,
      entry: 'resource-action',
    })
  } catch (error) {
    console.error(`Failed to open terminal for ${source}:`, error)
    toast.error(
      t('terminalLauncher.openFailed', {
        source,
        defaultValue: 'Failed to open terminal for {{source}}.',
      })
    )
  }
}
