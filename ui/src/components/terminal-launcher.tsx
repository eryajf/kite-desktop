import { useEffect, useMemo, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import type { Container, Pod } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import { useTerminal } from '@/contexts/terminal-context'
import { toSimpleContainer } from '@/lib/k8s'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TerminalLauncherProps {
  namespace?: string
  podName?: string
  pods?: Pod[]
  containers?: Container[]
  initContainers?: Container[]
  source?: string
  title?: string
  description?: string
}

export function TerminalLauncher({
  namespace,
  podName,
  pods,
  containers: workloadContainers = [],
  initContainers = [],
  source,
  title,
  description,
}: TerminalLauncherProps) {
  const { t } = useTranslation()
  const { openSession } = useTerminal()
  const availablePods = useMemo(() => {
    if (podName) return []
    return pods?.filter((pod) => Boolean(pod.metadata?.name)) ?? []
  }, [podName, pods])
  const simpleContainers = useMemo(
    () => toSimpleContainer(initContainers, workloadContainers),
    [initContainers, workloadContainers]
  )
  const [selectedPod, setSelectedPod] = useState(
    podName || availablePods[0]?.metadata?.name || ''
  )
  const [selectedContainer, setSelectedContainer] = useState(
    simpleContainers[0]?.name || ''
  )

  useEffect(() => {
    setSelectedPod((current) => {
      if (podName) return podName
      if (current && availablePods.some((pod) => pod.metadata?.name === current))
        return current
      return availablePods[0]?.metadata?.name || ''
    })
  }, [availablePods, podName])

  useEffect(() => {
    setSelectedContainer((current) => {
      if (
        current &&
        simpleContainers.some((container) => container.name === current)
      )
        return current
      return simpleContainers[0]?.name || ''
    })
  }, [simpleContainers])

  const effectivePodName = podName || selectedPod
  const effectiveNamespace =
    namespace ||
    availablePods.find((pod) => pod.metadata?.name === effectivePodName)
      ?.metadata?.namespace
  const canOpen = Boolean(effectiveNamespace && effectivePodName)

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-md border border-dashed bg-muted/20 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-background shadow-sm">
        <TerminalSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="max-w-xl space-y-2">
        <h3 className="text-base font-semibold">
          {title ?? t('terminalLauncher.title', 'Open terminal workspace')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {description ??
            t(
              'terminalLauncher.description',
              'Start the shell in the bottom terminal workspace. The session stays alive while you inspect other pages.'
            )}
        </p>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
        {availablePods.length > 1 ? (
          <Select value={selectedPod} onValueChange={setSelectedPod}>
            <SelectTrigger className="sm:flex-1">
              <SelectValue
                placeholder={t('terminalLauncher.selectPod', 'Select pod')}
              />
            </SelectTrigger>
            <SelectContent>
              {availablePods.map((pod) => (
                <SelectItem
                  key={pod.metadata!.name}
                  value={pod.metadata!.name!}
                >
                  {pod.metadata!.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {simpleContainers.length > 1 ? (
          <Select value={selectedContainer} onValueChange={setSelectedContainer}>
            <SelectTrigger className="sm:flex-1">
              <SelectValue
                placeholder={t(
                  'terminalLauncher.selectContainer',
                  'Select container'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {simpleContainers.map((container) => (
                <SelectItem key={container.name} value={container.name}>
                  {container.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Button
          className="sm:w-auto"
          disabled={!canOpen}
          onClick={() => {
            if (!effectiveNamespace || !effectivePodName) return
            openSession({
              type: 'pod',
              namespace: effectiveNamespace,
              podName: effectivePodName,
              containerName: selectedContainer || undefined,
              pods: podName ? undefined : pods,
              containers: workloadContainers,
              initContainers,
              source,
              title: source
                ? `${source} · ${effectivePodName}`
                : effectivePodName,
              subtitle: selectedContainer || effectiveNamespace,
              entry: 'resource',
            })
          }}
        >
          <TerminalSquare className="h-4 w-4" />
          {t('terminalLauncher.open', 'Open terminal')}
        </Button>
      </div>
    </div>
  )
}
