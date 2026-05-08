import React, { useCallback, useEffect, useRef, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const CLOSE_DELAY_MS = 120

function composeEventHandlers<E>(
  originalHandler: ((event: E) => void) | undefined,
  nextHandler: (event: E) => void
) {
  return (event: E) => {
    originalHandler?.(event)
    nextHandler(event)
  }
}

interface HoverActionDropdownMenuProps {
  trigger: React.ReactElement<React.ComponentProps<'button'>>
  content: React.ReactElement<
    React.ComponentProps<typeof DropdownMenuContent>
  >
}

export function HoverActionDropdownMenu({
  trigger,
  content,
}: HoverActionDropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openMenu = useCallback(() => {
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  useEffect(() => {
    return () => {
      clearCloseTimer()
    }
  }, [clearCloseTimer])

  const triggerNode = React.cloneElement(trigger, {
    onPointerEnter: composeEventHandlers(
      trigger.props.onPointerEnter,
      openMenu
    ),
    onPointerLeave: composeEventHandlers(
      trigger.props.onPointerLeave,
      scheduleClose
    ),
  })

  const contentNode = React.cloneElement(content, {
    onPointerEnter: composeEventHandlers(
      content.props.onPointerEnter,
      clearCloseTimer
    ),
    onPointerLeave: composeEventHandlers(
      content.props.onPointerLeave,
      scheduleClose
    ),
  })

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        clearCloseTimer()
        setOpen(nextOpen)
      }}
    >
      <DropdownMenuTrigger asChild>{triggerNode}</DropdownMenuTrigger>
      {contentNode}
    </DropdownMenu>
  )
}
