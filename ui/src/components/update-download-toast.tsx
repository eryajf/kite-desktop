import { useEffect, useState } from 'react'
import {
  IconDownload,
  IconFolderOpen,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
  IconX,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { revealPath } from '@/lib/desktop'
import { useDesktopUpdate } from '@/hooks/use-desktop-update'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatSpeed(bytesPerSec?: number) {
  if (!bytesPerSec || bytesPerSec <= 0) {
    return ''
  }
  return `${formatBytes(bytesPerSec)}/s`
}

export function UpdateDownloadToast() {
  const { t } = useTranslation()
  const {
    isDesktop,
    download,
    readyToApply,
    retryDownload,
    cancelDownload,
    applyUpdate,
    isRetryingDownload,
    isCancellingDownload,
    isApplyingUpdate,
  } = useDesktopUpdate()
  const [dismissedReadyPath, setDismissedReadyPath] = useState('')

  useEffect(() => {
    if (readyToApply?.path !== dismissedReadyPath) {
      setDismissedReadyPath('')
    }
  }, [dismissedReadyPath, readyToApply?.path])

  if (!isDesktop) {
    return null
  }

  if (readyToApply && readyToApply.path !== dismissedReadyPath) {
    return (
      <div className="pointer-events-none fixed bottom-3 right-3 z-50 w-[min(88vw,18rem)]">
        <Card className="pointer-events-auto border-primary/20 shadow-xl">
          <CardHeader className="px-3 pb-1.5 pt-2.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <IconDownload className="h-4 w-4 text-primary" />
              {t('updateToast.downloadedTitle', 'Update ready to install')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-2.5 pt-0">
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                'updateToast.downloadedDescription',
                'The installer package has been downloaded. Restart the app to continue the update.'
              )}
            </p>
            <div className="truncate rounded-lg border bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              v{readyToApply.version} · {readyToApply.assetName}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDismissedReadyPath(readyToApply.path)}
              >
                {t('common.later', 'Later')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void revealPath(readyToApply.path)}
              >
                <IconFolderOpen className="h-4 w-4" />
                {t('updateToast.showFile', 'Show file')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => applyUpdate()}
                disabled={isApplyingUpdate}
              >
                {isApplyingUpdate ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconPlayerPlay className="h-4 w-4" />
                )}
                {t('updateToast.apply', 'Restart and install')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!download) {
    return null
  }

  const progress =
    download.totalBytes > 0
      ? Math.min(
          100,
          Math.round((download.receivedBytes / download.totalBytes) * 100)
        )
      : 0

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 w-[min(88vw,18rem)]">
      <Card className="pointer-events-auto border-primary/20 shadow-xl">
        <CardHeader className="px-3 pb-1.5 pt-2.5">
          <CardTitle className="flex items-center gap-2 text-sm">
            {download.status === 'downloading' ? (
              <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <IconX className="h-4 w-4 text-destructive" />
            )}
            {download.status === 'downloading'
              ? t('updateToast.downloadingTitle', 'Downloading update')
              : t('updateToast.failedTitle', 'Update download failed')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-2.5 pt-0">
          <div className="truncate rounded-lg border bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            v{download.version} · {download.assetName}
          </div>
          <div className="space-y-1">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  download.status === 'downloading'
                    ? 'bg-primary'
                    : 'bg-destructive'
                }`}
                style={{
                  width:
                    download.totalBytes > 0
                      ? `${Math.max(progress, 4)}%`
                      : '18%',
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="shrink-0">
                {formatBytes(download.receivedBytes)}
                {download.totalBytes > 0
                  ? ` / ${formatBytes(download.totalBytes)}`
                  : ''}
              </span>
              <span className="truncate text-right">
                {download.status === 'downloading'
                  ? formatSpeed(download.speedBytesPerSec)
                  : download.error}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cancelDownload()}
              disabled={isCancellingDownload}
            >
              {isCancellingDownload ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconX className="h-4 w-4" />
              )}
              {t('common.cancel', 'Cancel')}
            </Button>
            {download.status === 'download_failed' ? (
              <Button
                type="button"
                size="sm"
                onClick={() => retryDownload()}
                disabled={isRetryingDownload}
              >
                {isRetryingDownload ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconRefresh className="h-4 w-4" />
                )}
                {t('common.retry', 'Retry')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
