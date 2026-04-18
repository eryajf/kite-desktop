import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { AppSidebar } from './app-sidebar'
import { SidebarProvider } from './ui/sidebar'

const useSidebarConfigMock = vi.fn()
const useDesktopUpdateMock = vi.fn()

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
  }
})

vi.mock('@/contexts/sidebar-config-context', () => ({
  useSidebarConfig: () => useSidebarConfigMock(),
}))

vi.mock('@/hooks/use-desktop-update', () => ({
  useDesktopUpdate: () => useDesktopUpdateMock(),
}))

vi.mock('./cluster-selector', () => ({
  ClusterSelector: () => <div>cluster-selector</div>,
}))

vi.mock('./navigation-controls', () => ({
  NavigationControls: () => <div>navigation-controls</div>,
}))

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <LocationDisplay />
      </SidebarProvider>
    </MemoryRouter>
  )
}

describe('AppSidebar', () => {
  it('shows a new badge and navigates to the about tab when an update is available', async () => {
    useSidebarConfigMock.mockReturnValue({
      isLoading: false,
      config: {
        groups: [],
        pinnedItems: [],
        hiddenItems: [],
      },
      getIconComponent: () => 'div',
    })
    useDesktopUpdateMock.mockReturnValue({
      result: {
        comparison: 'update_available',
        ignored: false,
      },
    })

    renderSidebar()

    const updateLink = screen.getByRole('link', {
      name: 'New version available',
    })

    expect(updateLink).toHaveTextContent('new')

    await userEvent.click(updateLink)

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/settings?tab=about'
    )
  })

  it('does not show the badge when no actionable update exists', () => {
    useSidebarConfigMock.mockReturnValue({
      isLoading: false,
      config: {
        groups: [],
        pinnedItems: [],
        hiddenItems: [],
      },
      getIconComponent: () => 'div',
    })
    useDesktopUpdateMock.mockReturnValue({
      result: {
        comparison: 'up_to_date',
        ignored: false,
      },
    })

    renderSidebar()

    expect(
      screen.queryByRole('link', { name: 'New version available' })
    ).not.toBeInTheDocument()
  })
})
