import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-page-title', () => ({
  usePageTitle: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

vi.mock('@/components/settings/desktop-management', () => ({
  DesktopManagement: () => <div>Desktop</div>,
}))

vi.mock('@/components/settings/general-management', () => ({
  GeneralManagement: () => <div>General</div>,
}))

vi.mock('@/components/settings/cluster-management', () => ({
  ClusterManagement: () => <div>Cluster</div>,
}))

vi.mock('@/components/settings/template-management', () => ({
  TemplateManagement: () => <div>Templates</div>,
}))

vi.mock('@/components/ui/responsive-tabs', () => ({
  ResponsiveTabs: ({
    tabs,
  }: {
    tabs: Array<{ label: string; content: React.ReactNode }>
  }) => (
    <div>
      {tabs.map((tab) => (
        <section key={tab.label}>
          <h2>{tab.label}</h2>
          {tab.content}
        </section>
      ))}
    </div>
  ),
}))

import { SettingsPage } from './settings'

describe('SettingsPage', () => {
  it('shows only desktop tabs in settings', () => {
    render(<SettingsPage />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Desktop' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'General' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Cluster' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Templates' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Authentication' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'RBAC' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'User' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'API Keys' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Audit' })
    ).not.toBeInTheDocument()
  })
})
