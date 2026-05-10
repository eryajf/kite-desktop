import { CircleHelp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type DrainOptionKey = 'forceDrain' | 'deleteLocalData' | 'ignoreDaemonsets'

const drainOptionHelp: Record<
  DrainOptionKey,
  { label: string; description: string }
> = {
  forceDrain: {
    label: 'Explain force drain',
    description:
      'Allows drain to delete standalone Pods that do not have a controller. Use carefully because those Pods will not be recreated automatically.',
  },
  deleteLocalData: {
    label: 'Explain delete local data',
    description:
      'Allows drain to delete Pods that use emptyDir local temporary storage. Keep it off when you are unsure; enable it when errors mention local storage or --delete-emptydir-data.',
  },
  ignoreDaemonsets: {
    label: 'Explain Ignore DaemonSets',
    description:
      'Skips DaemonSet-managed Pods during drain. DaemonSet Pods are not deleted by drain; they continue to be managed by their DaemonSet.',
  },
}

export function NodeDrainOptionRow({
  id,
  option,
  checked,
  onCheckedChange,
  label,
}: {
  id: string
  option: DrainOptionKey
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  const { t } = useTranslation()
  const baseKey = `detail.dialogs.drainNode.help.${option}`
  const help = drainOptionHelp[option]

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t(`${baseKey}.label`, help.label)}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs leading-relaxed">
          {t(`${baseKey}.description`, help.description)}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
