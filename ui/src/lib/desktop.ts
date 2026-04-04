import { withSubPath } from './subpath'

export const DESKTOP_LOCAL_RUNTIME = 'desktop-local'

export interface DesktopCapabilities {
  nativeFileDialog: boolean
  nativeSaveDialog: boolean
  tray: boolean
  menu: boolean
  singleInstance: boolean
}

export interface DesktopStatus {
  enabled: boolean
  runtime: string
  capabilities: DesktopCapabilities
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

export interface NativeDownloadFileOptions {
  title?: string
  message?: string
  buttonText?: string
  directory?: string
  suggestedName?: string
  url: string
  filters?: NativeFileFilter[]
}

export interface NativeDownloadFileResult {
  canceled: boolean
  path?: string
  bytesWritten?: number
}

export interface DesktopAppPaths {
  configDir: string
  logsDir: string
  cacheDir: string
  tempDir: string
}

export interface DesktopAppInfo {
  name: string
  runtime: string
  version: string
  buildDate: string
  commitId: string
  paths: DesktopAppPaths
}

const DEFAULT_CAPABILITIES: DesktopCapabilities = {
  nativeFileDialog: false,
  nativeSaveDialog: false,
  tray: false,
  menu: false,
  singleInstance: false,
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
      (status) => status.enabled && status.runtime === DESKTOP_LOCAL_RUNTIME
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

export async function saveTextFile(
  options: NativeSaveFileOptions
): Promise<NativeSaveFileResult> {
  const nativeResult = await saveNativeFile(options)
  if (nativeResult) {
    return nativeResult
  }

  browserDownload(options.content, options.suggestedName || 'download.txt')
  return { canceled: false }
}

export async function downloadNativeFile(
  options: NativeDownloadFileOptions
): Promise<NativeDownloadFileResult | null> {
  if (!(await isDesktopMode())) {
    return null
  }

  return postDesktop<NativeDownloadFileResult>(
    '/api/desktop/download-to-path',
    options
  )
}

export async function openPath(path: string): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/open-path', { path })
}

export async function revealPath(path: string): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/reveal-path', { path })
}

export async function openLogsDir(): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/open-logs-dir')
}

export async function openConfigDir(): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/open-config-dir')
}

export async function focusDesktopApp(): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/window/focus')
}

export async function hideDesktopApp(): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/window/hide')
}

export async function quitDesktopApp(): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/window/quit')
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (await invokeDesktopAction('/api/desktop/copy-to-clipboard', { text })) {
    return
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export async function importKubeconfig(content?: string): Promise<boolean> {
  return invokeDesktopAction('/api/desktop/import-kubeconfig', { content })
}

export async function getDesktopAppInfo(): Promise<DesktopAppInfo | null> {
  if (!(await isDesktopMode())) {
    return null
  }

  const response = await fetch(withSubPath('/api/desktop/app-info'), {
    credentials: 'include',
  })
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    throw new Error(error.error || `Desktop request failed: ${response.status}`)
  }

  return (await response.json()) as DesktopAppInfo
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
      return normalizeDesktopStatus()
    }

    const data = (await response
      .json()
      .catch(() => ({}))) as Partial<DesktopStatus>
    return normalizeDesktopStatus(data)
  } catch {
    return normalizeDesktopStatus()
  }
}

async function invokeDesktopAction(
  path: string,
  body: Record<string, unknown> = {}
): Promise<boolean> {
  if (!(await isDesktopMode())) {
    return false
  }

  await postDesktop<DesktopActionResponse>(path, body)
  return true
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

function normalizeDesktopStatus(
  status: Partial<DesktopStatus> = {}
): DesktopStatus {
  return {
    enabled: status.enabled === true,
    runtime: status.runtime || 'server',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...(status.capabilities || {}),
    },
  }
}

function browserDownload(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

interface DesktopActionResponse {
  ok: boolean
}
