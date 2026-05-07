/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import i18n from '@/i18n'

import {
  getAppearancePreference,
  saveAppearancePreference,
  type AppearancePreferencePayload,
} from '@/lib/api/admin'

import {
  type ColorTheme,
  colorThemes,
} from './color-theme-provider'
import { ColorThemeProvider, useColorTheme } from './color-theme-provider'
import { FontProvider, useFont } from './font-provider'
import { ThemeProvider, useTheme } from './theme-provider'

type AppearanceProviderProps = {
  children: ReactNode
  // Theme
  defaultTheme?: 'dark' | 'light' | 'system'
  themeStorageKey?: string
  // Color theme
  defaultColorTheme?: ColorTheme
  colorThemeStorageKey?: string
  // Font
  defaultFont?: 'system' | 'maple' | 'jetbrains'
  fontStorageKey?: string
}

export function AppearanceProvider({
  children,
  defaultTheme = 'system',
  themeStorageKey = 'vite-ui-theme',
  defaultColorTheme = 'default',
  colorThemeStorageKey = 'vite-ui-color-theme',
  defaultFont = 'maple',
  fontStorageKey = 'vite-ui-font',
}: AppearanceProviderProps) {
  return (
    <ThemeProvider defaultTheme={defaultTheme} storageKey={themeStorageKey}>
      <ColorThemeProvider
        defaultColorTheme={defaultColorTheme}
        storageKey={colorThemeStorageKey}
      >
        <FontProvider defaultFont={defaultFont} storageKey={fontStorageKey}>
          <AppearancePersistenceBridge />
          {children}
        </FontProvider>
      </ColorThemeProvider>
    </ThemeProvider>
  )
}

export default AppearanceProvider

// Unified hook for reading/updating all appearance settings in one place.
export function useAppearance() {
  const { theme, actualTheme, setTheme } = useTheme()
  const { colorTheme, setColorTheme } = useColorTheme()
  const { font, setFont } = useFont()

  return useMemo(
    () => ({
      theme,
      actualTheme,
      setTheme,
      colorTheme,
      setColorTheme,
      font,
      setFont,
    }),
    [theme, actualTheme, colorTheme, font, setTheme, setColorTheme, setFont]
  )
}

type ThemeOption = 'dark' | 'light' | 'system'
type FontOption = 'system' | 'maple' | 'jetbrains'
type LanguageOption = 'en' | 'zh'

function isThemeOption(value: unknown): value is ThemeOption {
  return value === 'dark' || value === 'light' || value === 'system'
}

function isColorThemeOption(value: unknown): value is ColorTheme {
  return typeof value === 'string' && value in colorThemes
}

function isFontOption(value: unknown): value is FontOption {
  return value === 'system' || value === 'maple' || value === 'jetbrains'
}

function normalizeLanguage(value: string | undefined): LanguageOption {
  return value?.startsWith('zh') ? 'zh' : 'en'
}

function parseAppearancePreference(
  value: Partial<AppearancePreferencePayload>
): AppearancePreferencePayload | null {
  if (
    !isThemeOption(value.theme) ||
    !isColorThemeOption(value.colorTheme) ||
    !isFontOption(value.font)
  ) {
    return null
  }

  return {
    theme: value.theme,
    colorTheme: value.colorTheme,
    font: value.font,
    language: normalizeLanguage(value.language),
  }
}

function AppearancePersistenceBridge() {
  const { theme, colorTheme, font, setTheme, setColorTheme, setFont } =
    useAppearance()
  const [language, setLanguage] = useState<LanguageOption>(() =>
    normalizeLanguage(i18n.resolvedLanguage || i18n.language)
  )
  const [isReady, setIsReady] = useState(false)
  const applyingRemoteRef = useRef(false)
  const lastPersistedRef = useRef<string | null>(null)

  useEffect(() => {
    const handleLanguageChange = (nextLanguage: string) => {
      setLanguage(normalizeLanguage(nextLanguage))
    }

    i18n.on('languageChanged', handleLanguageChange)
    return () => {
      i18n.off('languageChanged', handleLanguageChange)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadPreference = async () => {
      try {
        const response = await getAppearancePreference()
        const parsedPreference = parseAppearancePreference(response)

        if (parsedPreference) {
          const serialized = JSON.stringify(parsedPreference)
          lastPersistedRef.current = serialized
          applyingRemoteRef.current = true

          if (parsedPreference.theme !== theme) {
            setTheme(parsedPreference.theme)
          }
          if (parsedPreference.colorTheme !== colorTheme) {
            setColorTheme(parsedPreference.colorTheme)
          }
          if (parsedPreference.font !== font) {
            setFont(parsedPreference.font)
          }
          if (parsedPreference.language !== language) {
            await i18n.changeLanguage(parsedPreference.language)
          }
        }
      } catch (error) {
        console.error('Failed to load appearance preference from storage:', error)
      } finally {
        if (!cancelled) {
          applyingRemoteRef.current = false
          setIsReady(true)
        }
      }
    }

    void loadPreference()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isReady || applyingRemoteRef.current) {
      return
    }

    const serialized = JSON.stringify({
      theme,
      colorTheme,
      font,
      language,
    } satisfies AppearancePreferencePayload)

    if (serialized === lastPersistedRef.current) {
      return
    }

    lastPersistedRef.current = serialized
    void saveAppearancePreference({
      theme,
      colorTheme,
      font,
      language,
    }).catch((error) => {
      console.error('Failed to save appearance preference to storage:', error)
    })
  }, [colorTheme, font, isReady, language, theme])

  return null
}
