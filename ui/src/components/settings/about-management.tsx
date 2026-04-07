import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import Icon from '@/assets/icon.svg'
import {
  IconBrandGithub,
  IconDownload,
  IconExternalLink,
  IconInfoCircle,
  IconLoader2,
  IconRefresh,
  IconRosetteDiscountCheck,
} from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  checkVersionUpdate,
  useVersionInfo,
  type UpdateCheckInfo,
} from '@/lib/api'
import { getDesktopAppInfo, openURL, type DesktopAppInfo } from '@/lib/desktop'
import { PROJECT_REPOSITORY_URL } from '@/lib/project'
import { translateError } from '@/lib/utils'
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

  if (!isComparableRelease(result)) {
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

  if (result.hasNewVersion) {
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <AlertTitle>
          {t('aboutManagement.update.availableTitle', 'Update available')}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            {t(
              'aboutManagement.update.availableDescription',
              'A newer release is available for download.'
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

  const updateMutation = useMutation({
    mutationFn: () => checkVersionUpdate(true),
    onError: (error) => {
      toast.error(translateError(error, t))
    },
  })
  const updateErrorMessage = updateMutation.error
    ? translateError(updateMutation.error, t)
    : ''

  const appName = desktopInfo?.name || t('aboutManagement.productName', 'Kite')
  const currentVersion = normalizeVersion(
    desktopInfo?.version || versionInfo?.version
  )
  const buildDate = desktopInfo?.buildDate || versionInfo?.buildDate || '-'
  const commitId = desktopInfo?.commitId || versionInfo?.commitId || '-'
  const runtime = desktopInfo?.runtime || '-'

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
        <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
            <img src={Icon} alt={appName} className="h-10 w-10" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">{appName}</h2>
            <p className="text-sm text-muted-foreground">
              {t(
                'aboutManagement.subtitle',
                'Desktop edition built on top of Kite for local cluster workflows.'
              )}
            </p>
            <div className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              {t('aboutManagement.versionLabel', 'Version')} v{currentVersion}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
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
            {updateMutation.data?.releaseUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void openURL(updateMutation.data!.releaseUrl)}
              >
                {updateMutation.data.hasNewVersion ? (
                  <IconDownload className="h-4 w-4" />
                ) : (
                  <IconExternalLink className="h-4 w-4" />
                )}
                {updateMutation.data.hasNewVersion
                  ? t(
                      'aboutManagement.actions.downloadUpdate',
                      'Download update'
                    )
                  : t('aboutManagement.actions.viewRelease', 'View release')}
              </Button>
            ) : null}
          </div>
        </div>

        <UpdateStatus
          t={t}
          result={updateMutation.data}
          errorMessage={updateErrorMessage}
          isPending={updateMutation.isPending}
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
