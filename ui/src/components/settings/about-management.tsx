import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  IconArrowUpRight,
  IconBrandGithub,
  IconDownload,
  IconExternalLink,
  IconFolderOpen,
  IconInfoCircle,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconRosetteDiscountCheck,
  IconSparkles,
} from '@tabler/icons-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useVersionInfo, type UpdateCheckInfo } from '@/lib/api'
import {
  getDesktopAppInfo,
  openURL,
  revealPath,
  type DesktopAppInfo,
} from '@/lib/desktop'
import { PROJECT_REPOSITORY_URL } from '@/lib/project'
import { translateError } from '@/lib/utils'
import { useDesktopUpdate } from '@/hooks/use-desktop-update'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import AboutBanner from '../../../../docs/src/banner.svg'

function InfoItem({
  label,
  value,
  action,
}: {
  label: string
  value: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-2 break-all text-sm font-medium">{value}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

function normalizeVersion(version?: string) {
  const trimmed = version?.trim()
  if (!trimmed) {
    return '-'
  }
  return trimmed.replace(/^v/, '')
}

function formatCheckedAt(checkedAt?: string) {
  if (!checkedAt) {
    return ''
  }

  const parsed = new Date(checkedAt)
  if (Number.isNaN(parsed.getTime())) {
    return checkedAt
  }

  return parsed.toLocaleString()
}

function isComparableRelease(result: UpdateCheckInfo) {
  return Boolean(result.latestVersion?.trim())
}

function UpdateStatus({
  t,
  result,
  errorMessage,
  isPending,
}: {
  t: TFunction
  result?: UpdateCheckInfo
  errorMessage?: string
  isPending: boolean
}) {
  if (isPending) {
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
        <AlertTitle>
          {t('aboutManagement.update.checkingTitle', 'Checking for updates...')}
        </AlertTitle>
        <AlertDescription>
          {t(
            'aboutManagement.update.checkingDescription',
            'Comparing the current build with the latest GitHub release.'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          {t('aboutManagement.update.errorTitle', 'Update check failed')}
        </AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    )
  }

  if (!result) {
    return (
      <Alert>
        <AlertTitle>
          {t('aboutManagement.update.idleTitle', 'Manual update check')}
        </AlertTitle>
        <AlertDescription>
          {t(
            'aboutManagement.update.idleDescription',
            'Click "Check for updates" to compare this build with the latest GitHub release.'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (result.comparison === 'uncomparable' || !isComparableRelease(result)) {
    return (
      <Alert>
        <AlertTitle>
          {t(
            'aboutManagement.update.skippedTitle',
            'Release comparison unavailable'
          )}
        </AlertTitle>
        <AlertDescription>
          {t(
            'aboutManagement.update.skippedDescription',
            'The current build is a development version, so it cannot be compared with GitHub releases.'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (result.comparison === 'update_available') {
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <IconSparkles className="h-4 w-4 text-primary" />
        <AlertTitle>
          {result.ignored
            ? t('aboutManagement.update.ignoredTitle', 'Update ignored')
            : t('aboutManagement.update.availableTitle', 'Update available')}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            {result.ignored
              ? t(
                  'aboutManagement.update.ignoredDescription',
                  'This version was marked as ignored. You can enable it again at any time.'
                )
              : t(
                  'aboutManagement.update.availableDescription',
                  'A newer release is available.'
                )}
          </p>
          <p>
            {t('aboutManagement.update.currentVersion', 'Current version')}: v
            {normalizeVersion(result.currentVersion)} |{' '}
            {t('aboutManagement.update.latestVersion', 'Latest version')}: v
            {normalizeVersion(result.latestVersion)}
          </p>
          {result.assetAvailable === false ? (
            <p>
              {t(
                'aboutManagement.update.noAssetDescription',
                'The latest release is available, but there is no in-app update package for the current platform yet.'
              )}
            </p>
          ) : null}
          {result.publishedAt ? (
            <p>
              {t('aboutManagement.update.publishedAt', 'Published at')}:{' '}
              {formatCheckedAt(result.publishedAt)}
            </p>
          ) : null}
          {result.checkedAt ? (
            <p>
              {t('aboutManagement.update.checkedAt', 'Checked at')}:{' '}
              {formatCheckedAt(result.checkedAt)}
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  if (result.comparison === 'local_newer') {
    return (
      <Alert className="border-amber-500/25 bg-amber-500/5">
        <IconArrowUpRight className="h-4 w-4 text-amber-600" />
        <AlertTitle>
          {t('aboutManagement.update.localNewerTitle', 'Local build is newer')}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            {t(
              'aboutManagement.update.localNewerDescription',
              'The local build version is higher than the latest published GitHub release.'
            )}
          </p>
          <p>
            {t('aboutManagement.update.currentVersion', 'Current version')}: v
            {normalizeVersion(result.currentVersion)} |{' '}
            {t('aboutManagement.update.latestVersion', 'Latest version')}: v
            {normalizeVersion(result.latestVersion)}
          </p>
          {result.checkedAt ? (
            <p>
              {t('aboutManagement.update.checkedAt', 'Checked at')}:{' '}
              {formatCheckedAt(result.checkedAt)}
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="border-emerald-500/25 bg-emerald-500/5">
      <IconRosetteDiscountCheck className="h-4 w-4 text-emerald-600" />
      <AlertTitle>
        {t('aboutManagement.update.upToDateTitle', 'You are up to date')}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {t(
            'aboutManagement.update.upToDateDescription',
            'The current build already matches the latest GitHub release.'
          )}
        </p>
        {result.latestVersion ? (
          <p>
            {t('aboutManagement.update.latestVersion', 'Latest version')}: v
            {normalizeVersion(result.latestVersion)}
          </p>
        ) : null}
        {result.checkedAt ? (
          <p>
            {t('aboutManagement.update.checkedAt', 'Checked at')}:{' '}
            {formatCheckedAt(result.checkedAt)}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}

export function AboutManagement() {
  const { t } = useTranslation()
  const { data: versionInfo, isLoading: versionLoading } = useVersionInfo()
  const {
    isDesktop,
    result: updateResult,
    isLoadingState,
    isChecking,
    check,
    ignore,
    clearIgnore,
    startDownload,
    retryDownload,
    applyUpdate,
    download,
    readyToApply,
    isIgnoring,
    isClearingIgnore,
    isStartingDownload,
    isRetryingDownload,
    isApplyingUpdate,
    error: updateError,
  } = useDesktopUpdate()
  const [desktopInfo, setDesktopInfo] = useState<DesktopAppInfo | null>(null)

  const loadDesktopInfo = useCallback(async () => {
    try {
      setDesktopInfo(await getDesktopAppInfo())
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(
              'aboutManagement.messages.loadFailed',
              'Failed to load application information'
            )
      )
    }
  }, [t])

  useEffect(() => {
    void loadDesktopInfo()
  }, [loadDesktopInfo])

  const updateErrorMessage = updateError ? translateError(updateError, t) : ''

  const appName = desktopInfo?.name || t('aboutManagement.productName', 'Kite')
  const currentVersion = normalizeVersion(
    desktopInfo?.version || versionInfo?.version
  )
  const buildDate = desktopInfo?.buildDate || versionInfo?.buildDate || '-'
  const commitId = desktopInfo?.commitId || versionInfo?.commitId || '-'
  const runtime = desktopInfo?.runtime || '-'
  const latestVersion = updateResult?.latestVersion || ''
  const canDownloadUpdate =
    isDesktop &&
    updateResult?.comparison === 'update_available' &&
    !updateResult.ignored &&
    updateResult.assetAvailable &&
    latestVersion &&
    !download &&
    !readyToApply

  const commitURL = useMemo(() => {
    if (!commitId || commitId === '-' || commitId === 'unknown') {
      return ''
    }
    return `${PROJECT_REPOSITORY_URL}/commit/${commitId}`
  }, [commitId])

  if (versionLoading && !versionInfo) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        {t('common.loading', 'Loading...')}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconInfoCircle className="h-5 w-5" />
          {t('aboutManagement.title', 'About')}
        </CardTitle>
        <CardDescription>
          {t(
            'aboutManagement.description',
            'View build metadata and compare your local version with the latest GitHub release.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-3 text-center shadow-sm sm:p-4">
          <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#5bb8f5_0%,#8bc8ec_58%,#b7dfe8_73%,#4bac49_74%,#3b9636_100%)] shadow-sm">
            <img
              src={AboutBanner}
              alt={`${appName} banner`}
              className="block h-auto w-full"
            />
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="-translate-y-2 mx-auto flex max-w-xl flex-col items-center text-center sm:-translate-y-4">
                <div className="space-y-1.5">
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_10px_rgba(255,255,255,0.55)] sm:text-4xl">
                    {appName}
                  </h2>
                  <p className="text-base font-medium text-foreground/80 drop-shadow-[0_2px_10px_rgba(255,255,255,0.5)] sm:text-lg">
                    {t(
                      'aboutManagement.subtitle',
                      '一个基于 Wails v3 打造、面向桌面端的 K8S 多集群管理工具'
                    )}
                  </p>
                  <div className="inline-flex items-center rounded-full border border-white/80 bg-background/88 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                    {t('aboutManagement.versionLabel', 'Version')} v{currentVersion}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              onClick={() => check(true)}
              disabled={isChecking}
            >
              {isChecking ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconRefresh className="h-4 w-4" />
              )}
              {t('aboutManagement.actions.checkUpdate', 'Check for updates')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void openURL(PROJECT_REPOSITORY_URL)}
            >
              <IconBrandGithub className="h-4 w-4" />
              {t('aboutManagement.actions.openGithub', 'GitHub Repository')}
            </Button>
            {updateResult?.releaseUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void openURL(updateResult.releaseUrl)}
              >
                <IconExternalLink className="h-4 w-4" />
                {t('aboutManagement.actions.viewRelease', 'View release')}
              </Button>
            ) : null}
            {canDownloadUpdate ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => startDownload(latestVersion)}
                disabled={isStartingDownload}
              >
                {isStartingDownload ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconDownload className="h-4 w-4" />
                )}
                {t('aboutManagement.actions.downloadUpdate', 'Download update')}
              </Button>
            ) : null}
            {download?.status === 'download_failed' ? (
              <Button
                type="button"
                variant="outline"
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
            {readyToApply ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void revealPath(readyToApply.path)}
                >
                  <IconFolderOpen className="h-4 w-4" />
                  {t(
                    'aboutManagement.actions.showInstaller',
                    'Show installer file'
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={() => applyUpdate()}
                  disabled={isApplyingUpdate}
                >
                  {isApplyingUpdate ? (
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <IconPlayerPlay className="h-4 w-4" />
                  )}
                  {t(
                    'aboutManagement.actions.restartAndInstall',
                    'Restart and install'
                  )}
                </Button>
              </>
            ) : null}
            {isDesktop &&
            updateResult?.comparison === 'update_available' &&
            updateResult.latestVersion &&
            !updateResult.ignored &&
            !download &&
            !readyToApply ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => ignore(updateResult.latestVersion)}
                disabled={isIgnoring}
              >
                {isIgnoring ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconPlayerPause className="h-4 w-4" />
                )}
                {t(
                  'aboutManagement.actions.ignoreVersion',
                  'Ignore this version'
                )}
              </Button>
            ) : null}
            {isDesktop && updateResult?.ignored ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => clearIgnore()}
                disabled={isClearingIgnore}
              >
                {isClearingIgnore ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconRefresh className="h-4 w-4" />
                )}
                {t('aboutManagement.actions.clearIgnored', 'Show update again')}
              </Button>
            ) : null}
          </div>
        </div>

        <UpdateStatus
          t={t}
          result={updateResult}
          errorMessage={updateErrorMessage}
          isPending={
            isChecking || (isDesktop && isLoadingState && !updateResult)
          }
        />

        <div className="grid gap-4 md:grid-cols-2">
          <InfoItem
            label={t('aboutManagement.fields.version', 'Version')}
            value={`v${currentVersion}`}
          />
          <InfoItem
            label={t('aboutManagement.fields.buildDate', 'Build Date')}
            value={buildDate}
          />
          <InfoItem
            label={t('aboutManagement.fields.commit', 'Commit')}
            value={commitId}
            action={
              commitURL ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  onClick={() => void openURL(commitURL)}
                >
                  {t('aboutManagement.actions.viewCommit', 'View commit')}
                </Button>
              ) : undefined
            }
          />
          <InfoItem
            label={t('aboutManagement.fields.repository', 'Repository')}
            value={PROJECT_REPOSITORY_URL}
            action={
              <Button
                type="button"
                variant="link"
                className="h-auto px-0"
                onClick={() => void openURL(PROJECT_REPOSITORY_URL)}
              >
                {t('aboutManagement.actions.openRepository', 'Open repository')}
              </Button>
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <span>
            {t('aboutManagement.fields.runtime', 'Runtime')}: {runtime}
          </span>
          <span>
            {t('aboutManagement.fields.license', 'License')}: Apache License 2.0
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
