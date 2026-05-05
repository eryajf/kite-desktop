import type { Container } from 'kubernetes-types/core/v1'

import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

type ContainerImageEntry = {
  name: string
  image: string
}

export function toCompactImageName(image: string) {
  if (!image || image === '-') return '-'

  const digestIndex = image.lastIndexOf('@')
  if (digestIndex >= 0) {
    return image.slice(image.lastIndexOf('/') + 1)
  }

  const lastSlashIndex = image.lastIndexOf('/')
  return lastSlashIndex >= 0 ? image.slice(lastSlashIndex + 1) : image
}

function toImageEntries(containers?: Container[]): ContainerImageEntry[] {
  return (
    containers?.map((container) => ({
      name: container.name,
      image: container.image || '-',
    })) || []
  )
}

export function ContainerImagesSummary(props: { containers?: Container[] }) {
  const { containers } = props
  const images = toImageEntries(containers)

  if (images.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  const summary = images
    .map((entry) => `${entry.name}: ${toCompactImageName(entry.image)}`)
    .join(' | ')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="max-w-[320px] truncate text-xs text-muted-foreground"
          title={summary}
        >
          <span className="font-mono">{summary}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-md">
        <div className="space-y-2">
          {images.map((entry) => (
            <div key={`${entry.name}-${entry.image}`} className="min-w-0">
              <div className="text-primary-foreground/80 text-xs font-medium">
                {entry.name}
              </div>
              <div className="text-primary-foreground font-mono text-xs break-all">
                {entry.image}
              </div>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
