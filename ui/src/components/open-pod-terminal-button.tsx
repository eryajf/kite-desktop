import { TerminalSquare } from 'lucide-react'
import type { Container, Pod } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import { useTerminal } from '@/contexts/terminal-context'
import { Button } from '@/components/ui/button'

interface OpenPodTerminalButtonProps {
  namespace?: string
  pod?: Pod
  pods?: Pod[]
  containers?: Container[]
  initContainers?: Container[]
  source?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  label?: string
  iconOnly?: boolean
}

export function OpenPodTerminalButton({
  namespace,
  pod,
  pods,
  containers,
  initContainers,
  source,
  variant = 'outline',
  size = 'sm',
  label,
  iconOnly = false,
}: OpenPodTerminalButtonProps) {
  const { t } = useTranslation()
  const { openSession } = useTerminal()
  const targetPod = pod ?? pods?.find((item) => Boolean(item.metadata?.name))
  const podName = targetPod?.metadata?.name
  const podNamespace = targetPod?.metadata?.namespace ?? namespace
  const buttonLabel = label ?? t('terminalLauncher.open', 'Open terminal')

  return (
    <Button
      variant={variant}
      size={size}
      disabled={!podName || !podNamespace}
      title={buttonLabel}
      aria-label={buttonLabel}
      onClick={() => {
        if (!podName || !podNamespace) return
        openSession({
          type: 'pod',
          namespace: podNamespace,
          podName,
          containers: containers ?? targetPod?.spec?.containers,
          initContainers: initContainers ?? targetPod?.spec?.initContainers,
          source,
          title: source ? `${source} · ${podName}` : podName,
          subtitle: podNamespace,
          entry: 'resource-action',
        })
      }}
    >
      <TerminalSquare className="h-4 w-4" />
      {iconOnly ? <span className="sr-only">{buttonLabel}</span> : buttonLabel}
    </Button>
  )
}
