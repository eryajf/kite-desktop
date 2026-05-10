import { useEffect } from 'react'

export function IframeEscapeBridge() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && window.parent !== window) {
        window.parent.postMessage(
          { type: 'kite:related-resource-dialog:escape' },
          window.location.origin
        )
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
