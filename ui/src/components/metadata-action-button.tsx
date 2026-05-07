import { type ReactNode } from 'react'
import { FileText, Tags } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function MetadataActionButton(props: {
  icon: 'labels' | 'annotations'
  onClick: () => void
  ariaLabel: string
  tooltipContent?: ReactNode
  count?: number
}) {
  const { ariaLabel, count = 0, icon, onClick, tooltipContent } = props

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={ariaLabel}
          onClick={onClick}
          className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        >
          {icon === 'labels' ? (
            <Tags className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          <span className="min-w-[1ch] text-xs font-medium tabular-nums">
            {count}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipContent || ariaLabel}</TooltipContent>
    </Tooltip>
  )
}

export function renderMetadataTooltipContent(
  items?: Record<string, string>,
  emptyLabel = 'None'
) {
  const entries = Object.entries(items || {})

  if (entries.length === 0) {
    return emptyLabel
  }

  const maxItems = 6
  const visibleEntries = entries.slice(0, maxItems)
  const hiddenCount = entries.length - visibleEntries.length

  return (
    <div className="max-w-[520px]">
      <table className="w-full border-collapse border border-white/35 text-left text-xs">
        <thead>
          <tr className="border-b border-white/30">
            <th className="border-r border-white/25 px-3 py-1.5 font-semibold">
              键
            </th>
            <th className="px-3 py-1.5 font-semibold">值</th>
          </tr>
        </thead>
        <tbody>
          {visibleEntries.map(([key, value]) => (
            <tr key={key} className="align-top border-b border-white/15 last:border-b-0">
              <td className="max-w-[220px] truncate border-r border-white/20 px-3 py-1.5 font-medium">
                {key}
              </td>
              <td className="max-w-[260px] truncate px-3 py-1.5">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 ? (
        <div className="pt-1 text-right opacity-90">+{hiddenCount} more</div>
      ) : null}
    </div>
  )
}
