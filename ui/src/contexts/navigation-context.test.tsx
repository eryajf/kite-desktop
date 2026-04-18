import { act, render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

import {
  NavigationProvider,
  useNavigation,
} from '@/contexts/navigation-context'

const syncDesktopNavigationStateMock = vi.fn(() => Promise.resolve())
let desktopWindowName = 'main'

vi.mock('@/contexts/runtime-context', () => ({
  useRuntime: () => ({
    isDesktop: true,
    isReady: true,
  }),
}))

vi.mock('@/lib/desktop', () => ({
  DESKTOP_NAVIGATE_BACK_EVENT: 'kite:navigate-back',
  DESKTOP_NAVIGATE_FORWARD_EVENT: 'kite:navigate-forward',
  DESKTOP_WINDOW_NAME_CHANGE_EVENT: 'kite:window-name-change',
  getDesktopWindowName: () => desktopWindowName,
  syncDesktopNavigationState: (state: unknown) =>
    syncDesktopNavigationStateMock(state),
}))

function NavigationHarness() {
  const navigate = useNavigate()
  const location = useLocation()
  const { canGoBack, canGoForward, goBack, goForward } = useNavigation()

  return (
    <div>
      <div data-testid="location">{location.pathname + location.search}</div>
      <div data-testid="can-go-back">{String(canGoBack)}</div>
      <div data-testid="can-go-forward">{String(canGoForward)}</div>
      <textarea aria-label="editor" />
      <button type="button" onClick={() => navigate('/apps')}>
        apps
      </button>
      <button type="button" onClick={() => navigate('/apps/a')}>
        app detail
      </button>
      <button
        type="button"
        onClick={() => navigate('/settings?tab=about')}
      >
        settings about
      </button>
      <button
        type="button"
        onClick={() => navigate('/settings?tab=general', { replace: true })}
      >
        settings general replace
      </button>
      <button type="button" onClick={goBack}>
        go back
      </button>
      <button type="button" onClick={goForward}>
        go forward
      </button>
    </div>
  )
}

function renderNavigation(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigationProvider>
        <NavigationHarness />
      </NavigationProvider>
    </MemoryRouter>
  )
}

describe('NavigationProvider', () => {
  beforeEach(() => {
    desktopWindowName = 'main'
  })

  it('supports multi-step back and forward history', async () => {
    const user = userEvent.setup()
    renderNavigation()

    await user.click(screen.getByRole('button', { name: 'apps' }))
    await user.click(screen.getByRole('button', { name: 'app detail' }))
    await user.click(screen.getByRole('button', { name: 'settings about' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/settings?tab=about'
    )
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('true')
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('false')

    await user.click(screen.getByRole('button', { name: 'go back' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/apps/a')
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: 'go back' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/apps')

    await user.click(screen.getByRole('button', { name: 'go forward' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/apps/a')

    await act(async () => {
      window.dispatchEvent(new Event('kite:navigate-forward'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/settings?tab=about'
      )
    })
  })

  it('does not create an extra history level for replace navigations', async () => {
    const user = userEvent.setup()
    renderNavigation()

    await user.click(screen.getByRole('button', { name: 'settings about' }))
    await user.click(
      screen.getByRole('button', { name: 'settings general replace' })
    )

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/settings?tab=general'
    )

    await user.click(screen.getByRole('button', { name: 'go back' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/')
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('false')
  })

  it('handles mac-style bracket shortcuts from document keydown', async () => {
    const user = userEvent.setup()
    renderNavigation()

    await user.click(screen.getByRole('button', { name: 'apps' }))
    await user.click(screen.getByRole('button', { name: 'app detail' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/apps/a')

    fireEvent.keyDown(document, {
      key: '[',
      code: 'BracketLeft',
      metaKey: true,
    })

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/apps')
    })

    fireEvent.keyDown(document, {
      key: ']',
      code: 'BracketRight',
      metaKey: true,
    })

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/apps/a')
    })
  })

  it('ignores bracket shortcuts when focus is inside an editor field', async () => {
    const user = userEvent.setup()
    renderNavigation()

    await user.click(screen.getByRole('button', { name: 'apps' }))
    await user.click(screen.getByRole('button', { name: 'app detail' }))

    const editor = screen.getByRole('textbox', { name: 'editor' })
    editor.focus()

    fireEvent.keyDown(editor, {
      key: '[',
      code: 'BracketLeft',
      metaKey: true,
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/apps/a')
  })

  it('does not register document shortcuts for non-main desktop windows', async () => {
    const user = userEvent.setup()
    desktopWindowName = 'ai-sidecar'

    renderNavigation()

    await user.click(screen.getByRole('button', { name: 'apps' }))
    await user.click(screen.getByRole('button', { name: 'app detail' }))

    fireEvent.keyDown(document, {
      key: '[',
      code: 'BracketLeft',
      metaKey: true,
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/apps/a')
  })

  it('still handles shortcuts before the desktop window name is injected', async () => {
    const user = userEvent.setup()
    desktopWindowName = ''

    renderNavigation()

    await user.click(screen.getByRole('button', { name: 'apps' }))
    await user.click(screen.getByRole('button', { name: 'app detail' }))

    fireEvent.keyDown(document, {
      key: '[',
      code: 'BracketLeft',
      metaKey: true,
    })

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/apps')
    })
  })
})
