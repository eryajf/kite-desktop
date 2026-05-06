import { useCallback } from 'react'
import { Copy } from 'lucide-react'
import type { Container } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { Button } from '@/components/ui/button'
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
  const { t } = useTranslation()
  const { containers } = props
  const images = toImageEntries(containers)

  const handleCopyImage = useCallback(
    async (image: string) => {
      await copyTextToClipboard(image)
      toast.success(t('keyValueDataViewer.copiedToClipboard'))
    },
    [t]
  )

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
            <div
              key={`${entry.name}-${entry.image}`}
              className="min-w-0 rounded-md border border-white/10 bg-black/10 px-2.5 py-2"
            >
              <div className="text-primary-foreground/80 text-xs font-medium">
                {entry.name}
              </div>
              <div className="mt-1 flex items-start gap-2">
                <div className="text-primary-foreground min-w-0 flex-1 font-mono text-xs break-all leading-relaxed">
                  {entry.image}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6 shrink-0 bg-white/10 text-primary-foreground hover:bg-white/20"
                  aria-label={t('common.copyImage')}
                  title={t('common.copyImage')}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleCopyImage(entry.image)
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
