import { useState } from 'react'
import {
  CaseSensitive,
  Check,
  FolderCog,
  Logs,
  Palette,
  Settings2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { openConfigDir, openLogsDir } from '@/lib/desktop'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppearance } from '@/components/appearance-provider'
import { ColorTheme, colorThemes } from '@/components/color-theme-provider'

import { SidebarCustomizer } from './sidebar-customizer'

export function UserMenu() {
  const { colorTheme, setColorTheme, font, setFont } = useAppearance()
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const handleOpenConfigDir = () => {
    void openConfigDir().catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('userMenu.failedToOpenConfigDirectory')
      )
    })
  }

  const handleOpenLogsDir = () => {
    void openLogsDir().catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('userMenu.failedToOpenLogsDirectory')
      )
    })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 w-10 rounded-full text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground hover:text-foreground"
          aria-label={t('userMenu.appearanceSettings')}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full">
            <Settings2 className="h-5 w-5" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <div className="px-2 py-1.5">
          <p className="font-medium">{t('app.name', 'Kite')}</p>
          <p className="text-xs text-muted-foreground">
            {t('settings.tabs.desktop', 'Desktop')}
          </p>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleOpenConfigDir}>
          <FolderCog className="mr-2 h-4 w-4" />
          <span>{t('userMenu.openConfigDirectory')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleOpenLogsDir}>
          <Logs className="mr-2 h-4 w-4" />
          <span>{t('userMenu.openLogsDirectory')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 h-4 w-4" />
            <span>{t('userMenu.colorTheme')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {Object.entries(colorThemes).map(([key]) => {
              const isSelected = key === colorTheme

              return (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setColorTheme(key as ColorTheme)}
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected ? 'font-medium text-foreground' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="capitalize">{key}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CaseSensitive className="mr-2 h-4 w-4" />
            <span>{t('userMenu.font')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={() => setFont('system')}
              role="menuitemradio"
              aria-checked={font === 'system'}
              className={`flex items-center justify-between gap-2 cursor-pointer ${
                font === 'system' ? 'font-medium text-foreground' : ''
              }`}
            >
              <span>{t('userMenu.system')}</span>
              {font === 'system' && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setFont('maple')}
              role="menuitemradio"
              aria-checked={font === 'maple'}
              className={`flex items-center justify-between gap-2 cursor-pointer ${
                font === 'maple' ? 'font-medium text-foreground' : ''
              }`}
            >
              <span>Maple</span>
              {font === 'maple' && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setFont('jetbrains')}
              role="menuitemradio"
              aria-checked={font === 'jetbrains'}
              className={`flex items-center justify-between gap-2 cursor-pointer ${
                font === 'jetbrains' ? 'font-medium text-foreground' : ''
              }`}
            >
              <span>JetBrains Mono</span>
              {font === 'jetbrains' && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <SidebarCustomizer onOpenChange={(d) => setOpen(d)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
