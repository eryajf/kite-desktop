import { TerminalSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTerminal } from '@/contexts/terminal-context'
import { Button } from '@/components/ui/button'

interface OpenNodeTerminalButtonProps {
  nodeName?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  label?: string
  iconOnly?: boolean
}

export function OpenNodeTerminalButton({
  nodeName,
  variant = 'outline',
  size = 'sm',
  label,
  iconOnly = false,
}: OpenNodeTerminalButtonProps) {
  const { t } = useTranslation()
  const { openSession } = useTerminal()
  const buttonLabel = label ?? t('terminalLauncher.open', 'Open terminal')

  return (
    <Button
      variant={variant}
      size={size}
      disabled={!nodeName}
      title={buttonLabel}
      aria-label={buttonLabel}
      onClick={() => {
        if (!nodeName) return
        openSession({
          type: 'node',
          nodeName,
          title: nodeName,
          source: `node/${nodeName}`,
          entry: 'resource-action',
        })
      }}
    >
      <TerminalSquare className="h-4 w-4" />
      {iconOnly ? <span className="sr-only">{buttonLabel}</span> : buttonLabel}
    </Button>
  )
}
