import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

import { AppearanceProvider, useAppearance } from './appearance-provider'

function createStorage() {
  let store: Record<string, string> = {}

  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

vi.stubGlobal('localStorage', createStorage())
vi.stubGlobal('sessionStorage', createStorage())

let storedAppearancePreference = ''

function AppearanceConsumer() {
  const {
    theme,
    actualTheme,
    colorTheme,
    font,
    setTheme,
    setColorTheme,
    setFont,
  } = useAppearance()

  return (
    <div>
      <span data-testid="state">
        {theme}/{actualTheme}/{colorTheme}/{font}
      </span>
      <button
        type="button"
        onClick={() => {
          setTheme('dark')
          setColorTheme('claude')
          setFont('system')
        }}
      >
        update
      </button>
    </div>
  )
}

describe('AppearanceProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
    storedAppearancePreference = ''

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          storedAppearancePreference = JSON.stringify(JSON.parse(String(init.body)))
          return {
            ok: true,
            status: 204,
            headers: new Headers(),
            json: async () => ({}),
            text: async () => '',
          } satisfies Partial<Response>
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/json',
          }),
          json: async () =>
            storedAppearancePreference
              ? JSON.parse(storedAppearancePreference)
              : {},
          text: async () => storedAppearancePreference || '{}',
        } satisfies Partial<Response>
      })
    )

    void i18n.changeLanguage('en')
  })

  it('exposes the combined appearance state from its nested providers', async () => {
    render(
      <AppearanceProvider
        defaultTheme="light"
        themeStorageKey="appearance-theme"
        defaultColorTheme="default"
        colorThemeStorageKey="appearance-color"
        defaultFont="maple"
        fontStorageKey="appearance-font"
      >
        <AppearanceConsumer />
      </AppearanceProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent(
        'light/light/default/maple'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'update' }))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent(
        'dark/dark/claude/system'
      )
    })
    expect(localStorage.getItem('appearance-theme')).toBe('dark')
    expect(localStorage.getItem('appearance-color')).toBe('claude')
    expect(localStorage.getItem('appearance-font')).toBe('system')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveClass('color-claude')
    expect(
      document.documentElement.style.getPropertyValue('--app-font-sans')
    ).toBe('var(--font-sans)')
  })

  it('loads and persists appearance settings through the desktop preferences endpoint', async () => {
    storedAppearancePreference = JSON.stringify({
      theme: 'dark',
      colorTheme: 'claude',
      font: 'maple',
      language: 'zh',
    })

    const fetchMock = vi.mocked(fetch)

    render(
      <AppearanceProvider
        defaultTheme="light"
        themeStorageKey="appearance-theme"
        defaultColorTheme="default"
        colorThemeStorageKey="appearance-color"
        defaultFont="maple"
        fontStorageKey="appearance-font"
      >
        <AppearanceConsumer />
      </AppearanceProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent(
        'dark/dark/claude/maple'
      )
    })

    await waitFor(() => expect(i18n.resolvedLanguage || i18n.language).toBe('zh'))
    expect(localStorage.getItem('appearance-theme')).toBe('dark')
    expect(localStorage.getItem('appearance-color')).toBe('claude')
    expect(localStorage.getItem('appearance-font')).toBe('maple')

    fireEvent.click(screen.getByRole('button', { name: 'update' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/preferences/appearance'),
        expect.objectContaining({ method: 'PUT' })
      )
    )

    expect(JSON.parse(storedAppearancePreference)).toEqual({
      theme: 'dark',
      colorTheme: 'claude',
      font: 'system',
      language: 'zh',
    })
  })
})
