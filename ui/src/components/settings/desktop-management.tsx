import { useEffect, useState } from 'react'
import {
  IconFolderOpen,
  IconInfoCircle,
  IconLogs,
  IconRefresh,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import {
  getDesktopAppInfo,
  openConfigDir,
  openLogsDir,
  type DesktopAppInfo,
} from '@/lib/desktop'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <code className="text-right text-xs break-all">
        {value && value.trim() ? value : '-'}
      </code>
    </div>
  )
}

export function DesktopManagement() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<DesktopAppInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const loadInfo = async () => {
    setLoading(true)
    try {
      setInfo(await getDesktopAppInfo())
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t(
              'desktopManagement.messages.loadFailed',
              'Failed to load desktop info'
            )
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInfo()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconInfoCircle className="h-5 w-5" />
          {t('desktopManagement.title', 'Desktop')}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void openConfigDir().catch((error) => {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : t(
                        'desktopManagement.messages.openConfigDirFailed',
                        'Failed to open config directory'
                      )
                )
              })
            }}
          >
            <IconFolderOpen className="mr-2 h-4 w-4" />
            {t(
              'desktopManagement.actions.openConfigDir',
              'Open Config Directory'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void openLogsDir().catch((error) => {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : t(
                        'desktopManagement.messages.openLogsDirFailed',
                        'Failed to open logs directory'
                      )
                )
              })
            }}
          >
            <IconLogs className="mr-2 h-4 w-4" />
            {t(
              'desktopManagement.actions.openLogsDir',
              'Open Logs Directory'
            )}
          </Button>
          <Button variant="ghost" onClick={() => void loadInfo()}>
            <IconRefresh className="mr-2 h-4 w-4" />
            {t('desktopManagement.actions.refresh', 'Refresh')}
          </Button>
        </div>

        {loading && !info ? (
          <div className="py-6 text-sm text-muted-foreground">
            {t('desktopManagement.loading', 'Loading desktop information...')}
          </div>
        ) : (
          <div className="grid gap-3">
            <DetailRow
              label={t('desktopManagement.fields.runtime', 'Runtime')}
              value={info?.runtime}
            />
            <DetailRow
              label={t('desktopManagement.fields.version', 'Version')}
              value={info?.version}
            />
            <DetailRow
              label={t('desktopManagement.fields.buildDate', 'Build Date')}
              value={info?.buildDate}
            />
            <DetailRow
              label={t('desktopManagement.fields.commit', 'Commit')}
              value={info?.commitId}
            />
            <DetailRow
              label={t(
                'desktopManagement.fields.configDir',
                'Config Directory'
              )}
              value={info?.paths.configDir}
            />
            <DetailRow
              label={t('desktopManagement.fields.logsDir', 'Logs Directory')}
              value={info?.paths.logsDir}
            />
            <DetailRow
              label={t('desktopManagement.fields.cacheDir', 'Cache Directory')}
              value={info?.paths.cacheDir}
            />
            <DetailRow
              label={t('desktopManagement.fields.tempDir', 'Temp Directory')}
              value={info?.paths.tempDir}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
