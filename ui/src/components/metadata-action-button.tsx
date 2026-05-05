import { FileText, Tags } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function MetadataActionButton(props: {
  icon: 'labels' | 'annotations'
  onClick: () => void
  ariaLabel: string
}) {
  const { ariaLabel, icon, onClick } = props

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {icon === 'labels' ? (
        <Tags className="h-4 w-4" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
    </Button>
  )
}
