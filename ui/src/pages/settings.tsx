import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { ClusterManagement } from '@/components/settings/cluster-management'
import { DesktopManagement } from '@/components/settings/desktop-management'
import { GeneralManagement } from '@/components/settings/general-management'
import { TemplateManagement } from '@/components/settings/template-management'

export function SettingsPage() {
  const { t } = useTranslation()

  usePageTitle(t('settings.title', 'Settings'))

  const tabs: Array<{
    value: string
    label: string
    content: ReactNode
  }> = [
    {
      value: 'desktop',
      label: t('settings.tabs.desktop', 'Desktop'),
      content: <DesktopManagement />,
    },
    {
      value: 'general',
      label: t('settings.tabs.general', 'General'),
      content: <GeneralManagement />,
    },
    {
      value: 'clusters',
      label: t('settings.tabs.clusters', 'Cluster'),
      content: <ClusterManagement />,
    },
    {
      value: 'templates',
      label: t('settings.tabs.templates', 'Templates'),
      content: <TemplateManagement />,
    },
  ]

  return (
    <div className="space-y-2">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl">{t('settings.title', 'Settings')}</h1>
        </div>
        <p className="text-muted-foreground">
          {t(
            'settings.descriptionLocal',
            'Manage local preferences, clusters and templates'
          )}
        </p>
      </div>

      <ResponsiveTabs tabs={tabs} />
    </div>
  )
}
