import { useState } from 'react'
import { IconCopy, IconEye, IconEyeOff } from '@tabler/icons-react'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/desktop'
import { Button } from '@/components/ui/button'

interface Props {
  /** Key-value entries to display */
  entries: Record<string, string>
  /** If true, values are blurred by default and can be revealed per-key */
  sensitive?: boolean
  /** If true, values are base64-encoded and will be decoded for display */
  base64Encoded?: boolean
  emptyMessage?: string
}

function decode(value: string) {
  try {
    return atob(value)
  } catch {
    return value
  }
}

export function KeyValueDataViewer({
  entries,
  sensitive = false,
  base64Encoded = false,
  emptyMessage = 'No entries',
}: Props) {
  const keys = Object.keys(entries)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  const toggleKey = (key: string) =>
    setRevealedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })

  const toggleAll = () => {
    const allRevealed =
      keys.length > 0 && keys.every((k) => revealedKeys.has(k))
    setRevealedKeys(allRevealed ? new Set() : new Set(keys))
  }

  const copyToClipboard = async (value: string) => {
    await copyTextToClipboard(value)
    toast.success('Copied to clipboard')
  }

  if (keys.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  const allRevealed = keys.every((k) => revealedKeys.has(k))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {keys.length} {keys.length === 1 ? 'entry' : 'entries'}
        </span>
        {sensitive && (
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {allRevealed ? (
              <>
                <IconEyeOff className="h-4 w-4 mr-1" />
                Hide All
              </>
            ) : (
              <>
                <IconEye className="h-4 w-4 mr-1" />
                Reveal All
              </>
            )}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {Object.entries(entries).map(([key, rawValue]) => {
          const displayValue = base64Encoded ? decode(rawValue) : rawValue
          const revealed = !sensitive || revealedKeys.has(key)

          return (
            <div key={key} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium font-mono">{key}</span>
                <div className="flex items-center gap-1">
                  {sensitive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => toggleKey(key)}
                      title={revealed ? 'Hide' : 'Reveal'}
                    >
                      {revealed ? (
                        <IconEyeOff className="h-4 w-4" />
                      ) : (
                        <IconEye className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(displayValue)}
                    title="Copy value"
                  >
                    <IconCopy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-muted rounded px-3 py-2 font-mono text-xs break-all">
                <span className={revealed ? '' : 'blur-sm select-none inline'}>
                  {displayValue}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
