import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import {
  CaseSensitive,
  Check,
  FolderCog,
  LogOut,
  Logs,
  Palette,
  Settings2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { openConfigDir, openLogsDir } from '@/lib/desktop'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  const { user, logout, hasGlobalSidebarPreference, isLocalMode } = useAuth()
  const { colorTheme, setColorTheme, font, setFont } = useAppearance()
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  if (!user) return null

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleLogout = async () => {
    if (isLocalMode) {
      return
    }
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

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
          className="relative h-10 w-10 rounded-full"
          aria-label={
            isLocalMode
              ? t('userMenu.appearanceSettings')
              : t('userMenu.userMenu')
          }
        >
          {isLocalMode ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Settings2 className="h-5 w-5" />
            </span>
          ) : (
            <Avatar className="size-sm">
              <AvatarImage
                src={user.avatar_url}
                alt={user.name || user.username}
              />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials(user.name || user.username)}
              </AvatarFallback>
            </Avatar>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        {!isLocalMode && (
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              {user.name && <p className="font-medium">{user.name}</p>}
              <p className="text-xs text-muted-foreground">{user.username}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {t('userMenu.via', { provider: user.provider })}
              </p>
              {user.roles && user.roles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('userMenu.role', {
                    roles: user.roles.map((role) => role.name).join(', '),
                  })}
                </p>
              )}
            </div>
          </div>
        )}

        {!isLocalMode && <DropdownMenuSeparator />}

        {isLocalMode && (
          <>
            <DropdownMenuItem onClick={handleOpenConfigDir}>
              <FolderCog className="mr-2 h-4 w-4" />
              <span>{t('userMenu.openConfigDirectory')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenLogsDir}>
              <Logs className="mr-2 h-4 w-4" />
              <span>{t('userMenu.openLogsDirectory')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

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

        {(user.isAdmin() || !hasGlobalSidebarPreference) && (
          <SidebarCustomizer onOpenChange={(d) => setOpen(d)} />
        )}

        {!isLocalMode && user.provider !== 'Anonymous' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-red-600 focus:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>{t('userMenu.logOut')}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
