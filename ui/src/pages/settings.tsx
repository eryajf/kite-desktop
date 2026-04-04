import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { useAuth } from '@/contexts/auth-context'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { APIKeyManagement } from '@/components/settings/apikey-management'
import { AuditLog } from '@/components/settings/audit-log'
import { AuthenticationManagement } from '@/components/settings/authentication-management'
import { ClusterManagement } from '@/components/settings/cluster-management'
import { DesktopManagement } from '@/components/settings/desktop-management'
import { GeneralManagement } from '@/components/settings/general-management'
import { RBACManagement } from '@/components/settings/rbac-management'
import { TemplateManagement } from '@/components/settings/template-management'
import { UserManagement } from '@/components/settings/user-management'

export function SettingsPage() {
  const { t } = useTranslation()
  const { isLocalMode } = useAuth()

  usePageTitle('Settings')

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
    {
      value: 'audit',
      label: t('settings.tabs.audit', 'Audit'),
      content: <AuditLog />,
    },
  ]

  if (!isLocalMode) {
    tabs.splice(2, 0, {
      value: 'oauth',
      label: t('settings.tabs.oauth', 'Authentication'),
      content: <AuthenticationManagement />,
    })
    tabs.splice(3, 0, {
      value: 'rbac',
      label: t('settings.tabs.rbac', 'RBAC'),
      content: <RBACManagement />,
    })
    tabs.splice(4, 0, {
      value: 'users',
      label: t('settings.tabs.users', 'User'),
      content: <UserManagement />,
    })
    tabs.splice(5, 0, {
      value: 'apikeys',
      label: t('settings.tabs.apikeys', 'API Keys'),
      content: <APIKeyManagement />,
    })
  }

  return (
    <div className="space-y-2">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl">{t('settings.title', 'Settings')}</h1>
        </div>
        <p className="text-muted-foreground">
          {isLocalMode
            ? t(
                'settings.description.local',
                'Manage local preferences, clusters and templates'
              )
            : t(
                'settings.description',
                'Manage clusters, roles and permissions'
              )}
        </p>
      </div>

      <ResponsiveTabs tabs={tabs} />
    </div>
  )
}
