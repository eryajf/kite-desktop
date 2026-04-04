import { withSubPath } from './subpath'

export interface DesktopCapabilities {
  nativeFileDialog: boolean
  nativeSaveDialog: boolean
  tray: boolean
  menu: boolean
  singleInstance: boolean
}

export interface DesktopStatus {
  enabled: boolean
  runtime?: string
  capabilities?: Partial<DesktopCapabilities>
}

export interface DesktopWindowOptions {
  title?: string
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
}

export interface NativeFileFilter {
  displayName: string
  pattern: string
}

export interface NativeFileOptions {
  title?: string
  message?: string
  buttonText?: string
  directory?: string
  readContent?: boolean
  filters?: NativeFileFilter[]
}

export interface NativeFileSelection {
  canceled: boolean
  path?: string
  name?: string
  content?: string
}

export interface NativeSaveFileOptions {
  title?: string
  message?: string
  buttonText?: string
  directory?: string
  suggestedName?: string
  content: string
  filters?: NativeFileFilter[]
}

export interface NativeSaveFileResult {
  canceled: boolean
  path?: string
}

let desktopModePromise: Promise<boolean> | null = null
let desktopStatusPromise: Promise<DesktopStatus> | null = null

export function getDesktopStatus(): Promise<DesktopStatus> {
  if (!desktopStatusPromise) {
    desktopStatusPromise = fetchDesktopStatus()
  }
  return desktopStatusPromise
}

export function isDesktopMode(): Promise<boolean> {
  if (!desktopModePromise) {
    desktopModePromise = getDesktopStatus().then(
      (status) => status.enabled && status.runtime === 'desktop-local'
    )
  }
  return desktopModePromise
}

export async function openURL(
  url: string,
  options: DesktopWindowOptions = {}
): Promise<void> {
  try {
    if (await isDesktopMode()) {
      await postDesktop('/api/desktop/open-url', {
        url,
        ...options,
      })
      return
    }
  } catch (error) {
    console.error('Desktop open-url failed:', error)
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function openNativeFile(
  options: NativeFileOptions = {}
): Promise<NativeFileSelection | null> {
  if (!(await isDesktopMode())) {
    return null
  }

  return postDesktop<NativeFileSelection>('/api/desktop/open-file', {
    readContent: true,
    ...options,
  })
}

export async function saveNativeFile(
  options: NativeSaveFileOptions
): Promise<NativeSaveFileResult | null> {
  if (!(await isDesktopMode())) {
    return null
  }

  return postDesktop<NativeSaveFileResult>('/api/desktop/save-file', options)
}

export function installDesktopTargetBlankInterceptor(): () => void {
  let cleanup = () => {}
  let active = true

  void isDesktopMode().then((enabled) => {
    if (!active || !enabled) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a[target="_blank"]')
      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      const href = anchor.href || anchor.getAttribute('href')
      if (!href) {
        return
      }

      event.preventDefault()
      void openURL(href)
    }

    document.addEventListener('click', handleClick, true)
    cleanup = () => {
      document.removeEventListener('click', handleClick, true)
    }
  })

  return () => {
    active = false
    cleanup()
  }
}

async function fetchDesktopStatus(): Promise<DesktopStatus> {
  try {
    const response = await fetch(withSubPath('/api/desktop/status'), {
      credentials: 'include',
    })
    if (!response.ok) {
      return { enabled: false }
    }

    return (await response.json().catch(() => ({
      enabled: false,
    }))) as DesktopStatus
  } catch {
    return { enabled: false }
  }
}

async function postDesktop<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(withSubPath(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    throw new Error(error.error || `Desktop request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}
