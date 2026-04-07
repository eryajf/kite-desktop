import { useRuntime } from '@/contexts/runtime-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { checkVersionUpdate, type UpdateCheckInfo } from '@/lib/api'
import {
  applyDesktopUpdate,
  cancelDesktopUpdateDownload,
  checkDesktopUpdate,
  clearIgnoredDesktopUpdate,
  getDesktopUpdateState,
  ignoreDesktopUpdate,
  retryDesktopUpdateDownload,
  startDesktopUpdateDownload,
} from '@/lib/desktop'

export const desktopUpdateStateKey = ['desktop-update-state'] as const

interface DesktopUpdateStateData {
  ignoredVersion: string
  lastCheck?: UpdateCheckInfo
  download?: {
    status: 'downloading' | 'download_failed'
    version: string
    assetName: string
    downloadUrl: string
    targetPath: string
    receivedBytes: number
    totalBytes: number
    speedBytesPerSec: number
    error?: string
    startedAt?: string
    updatedAt?: string
  }
  readyToApply?: {
    version: string
    assetName: string
    path: string
    downloadedAt?: string
  }
}

async function readDesktopUpdateState(): Promise<DesktopUpdateStateData> {
  const state = await getDesktopUpdateState()
  return {
    ignoredVersion: state?.ignoredVersion || '',
    lastCheck: state?.lastCheck,
    download: state?.download,
    readyToApply: state?.readyToApply,
  }
}

export function useDesktopUpdate() {
  const { isDesktop, isReady } = useRuntime()
  const queryClient = useQueryClient()

  const showMutationError = (error: unknown) => {
    toast.error(
      error instanceof Error ? error.message : 'Update operation failed'
    )
  }

  const stateQuery = useQuery({
    queryKey: desktopUpdateStateKey,
    queryFn: readDesktopUpdateState,
    enabled: isReady && isDesktop,
    staleTime: 1000 * 60,
    refetchInterval: (query) => {
      const state = query.state.data as DesktopUpdateStateData | undefined
      return state?.download?.status === 'downloading' ? 1000 : false
    },
  })

  const refreshState = async () => {
    if (!isDesktop) {
      return
    }
    await queryClient.invalidateQueries({ queryKey: desktopUpdateStateKey })
  }

  const checkMutation = useMutation({
    mutationFn: async (force: boolean = true) => {
      if (isDesktop) {
        const result = await checkDesktopUpdate(force)
        return result as UpdateCheckInfo
      }
      return checkVersionUpdate(force)
    },
    onSuccess: async (result) => {
      if (!isDesktop) {
        return
      }
      queryClient.setQueryData<DesktopUpdateStateData>(
        desktopUpdateStateKey,
        (prev) => ({
          ignoredVersion:
            prev?.ignoredVersion ||
            (result.ignored ? result.latestVersion.replace(/^v/, '') : ''),
          lastCheck: result,
          download: prev?.download,
          readyToApply: prev?.readyToApply,
        })
      )
      await refreshState()
    },
    onError: showMutationError,
  })

  const ignoreMutation = useMutation({
    mutationFn: async (version: string) => {
      await ignoreDesktopUpdate(version)
      return version.replace(/^v/, '')
    },
    onSuccess: (version) => {
      queryClient.setQueryData<DesktopUpdateStateData>(
        desktopUpdateStateKey,
        (prev) => ({
          ignoredVersion: version,
          lastCheck: prev?.lastCheck
            ? {
                ...prev.lastCheck,
                ignored: prev.lastCheck.latestVersion === version,
              }
            : prev?.lastCheck,
          download: prev?.download,
          readyToApply: prev?.readyToApply,
        })
      )
    },
    onError: showMutationError,
  })

  const clearIgnoreMutation = useMutation({
    mutationFn: clearIgnoredDesktopUpdate,
    onSuccess: () => {
      queryClient.setQueryData<DesktopUpdateStateData>(
        desktopUpdateStateKey,
        (prev) => ({
          ignoredVersion: '',
          lastCheck: prev?.lastCheck
            ? { ...prev.lastCheck, ignored: false }
            : prev?.lastCheck,
          download: prev?.download,
          readyToApply: prev?.readyToApply,
        })
      )
    },
    onError: showMutationError,
  })

  const startDownloadMutation = useMutation({
    mutationFn: async (version: string) => startDesktopUpdateDownload(version),
    onSuccess: refreshState,
    onError: showMutationError,
  })

  const retryDownloadMutation = useMutation({
    mutationFn: retryDesktopUpdateDownload,
    onSuccess: refreshState,
    onError: showMutationError,
  })

  const cancelDownloadMutation = useMutation({
    mutationFn: cancelDesktopUpdateDownload,
    onSuccess: refreshState,
    onError: showMutationError,
  })

  const applyUpdateMutation = useMutation({
    mutationFn: applyDesktopUpdate,
    onError: showMutationError,
  })

  return {
    isDesktop,
    state: stateQuery.data,
    result: isDesktop ? stateQuery.data?.lastCheck : checkMutation.data,
    download: stateQuery.data?.download,
    readyToApply: stateQuery.data?.readyToApply,
    isLoadingState: stateQuery.isLoading,
    isChecking: checkMutation.isPending,
    isStartingDownload: startDownloadMutation.isPending,
    isRetryingDownload: retryDownloadMutation.isPending,
    isCancellingDownload: cancelDownloadMutation.isPending,
    isApplyingUpdate: applyUpdateMutation.isPending,
    check: (force: boolean = true) => checkMutation.mutate(force),
    checkAsync: (force: boolean = true) => checkMutation.mutateAsync(force),
    ignore: (version: string) => ignoreMutation.mutate(version),
    clearIgnore: () => clearIgnoreMutation.mutate(),
    startDownload: (version: string) => startDownloadMutation.mutate(version),
    retryDownload: () => retryDownloadMutation.mutate(),
    cancelDownload: () => cancelDownloadMutation.mutate(),
    applyUpdate: () => applyUpdateMutation.mutate(),
    refreshState,
    isIgnoring: ignoreMutation.isPending,
    isClearingIgnore: clearIgnoreMutation.isPending,
    error:
      checkMutation.error ||
      stateQuery.error ||
      ignoreMutation.error ||
      clearIgnoreMutation.error ||
      startDownloadMutation.error ||
      retryDownloadMutation.error ||
      cancelDownloadMutation.error ||
      applyUpdateMutation.error,
  }
}
