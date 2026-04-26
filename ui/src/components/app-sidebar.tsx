import * as React from 'react'
import { useMemo } from 'react'
import Icon from '@/assets/icon.png'
import { useSidebarConfig } from '@/contexts/sidebar-config-context'
import { useDesktopUpdate } from '@/hooks/use-desktop-update'
import { CollapsibleContent } from '@radix-ui/react-collapsible'
import { IconLayoutDashboard } from '@tabler/icons-react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

import { ClusterSelector } from './cluster-selector'
import { NavigationControls } from './navigation-controls'
import { Collapsible, CollapsibleTrigger } from './ui/collapsible'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const location = useLocation()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const { config, isLoading, getIconComponent } = useSidebarConfig()
  const { result: updateResult } = useDesktopUpdate()
  const isIconCollapsed = !isMobile && state === 'collapsed'

  const showUpdateBadge =
    updateResult?.comparison === 'update_available' && !updateResult.ignored

  const pinnedItems = useMemo(() => {
    if (!config) return []
    return config.groups
      .flatMap((group) => group.items)
      .filter((item) => config.pinnedItems.includes(item.id))
      .filter((item) => !config.hiddenItems.includes(item.id))
  }, [config])

  const visibleGroups = useMemo(() => {
    if (!config) return []
    return config.groups
      .filter((group) => group.visible)
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        ...group,
        items: group.items
          .filter((item) => !config.hiddenItems.includes(item.id))
          .filter((item) => !config.pinnedItems.includes(item.id))
          .sort((a, b) => a.order - b.order),
      }))
      .filter((group) => group.items.length > 0)
  }, [config])

  const isActive = (url: string) => {
    if (url === '/') {
      return location.pathname === '/'
    }
    if (url === '/crds') {
      return location.pathname == '/crds'
    }
    return location.pathname.startsWith(url)
  }

  // Handle menu item click on mobile - close sidebar
  const handleMenuItemClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const branding = (
    <SidebarHeader className="gap-2 border-b border-sidebar-border/60 px-2 py-2">
      <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:justify-center">
        <Link
          to="/"
          onClick={handleMenuItemClick}
          className="flex shrink-0 items-center gap-2"
        >
          <img src={Icon} alt="Kite Logo" className="h-8 w-8 shrink-0" />
          <span className="shrink-0 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-base font-semibold text-transparent group-data-[collapsible=icon]:hidden">
            Kite
          </span>
        </Link>
        <div className="shrink-0 group-data-[collapsible=icon]:hidden">
          <NavigationControls />
        </div>
        {showUpdateBadge ? (
          <Link
            to="/settings?tab=about"
            onClick={handleMenuItemClick}
            aria-label={t('sidebar.newVersionAvailable', 'New version available')}
            title={t('sidebar.newVersionAvailable', 'New version available')}
            className="shrink-0 italic text-[10px] font-semibold text-red-500 transition-colors hover:text-red-600 group-data-[collapsible=icon]:hidden"
          >
            new
          </Link>
        ) : null}
      </div>
    </SidebarHeader>
  )

  if (isLoading || !config) {
    return (
      <Sidebar collapsible="icon" {...props}>
        {branding}
        <SidebarContent>
          <div className="p-4 text-center text-muted-foreground">
            {t('common.loading', 'Loading...')}
          </div>
        </SidebarContent>
      </Sidebar>
    )
  }

  const renderGroupItems = (items: typeof visibleGroups[number]['items']) => (
    <SidebarMenu>
      {items.map((item) => {
        const IconComponent = getIconComponent(item.icon)
        const title = item.titleKey
          ? t(item.titleKey, { defaultValue: item.titleKey })
          : ''
        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              tooltip={title}
              asChild
              isActive={isActive(item.url)}
            >
              <Link to={item.url} onClick={handleMenuItemClick}>
                <IconComponent className="text-sidebar-primary" />
                <span>{title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )

  return (
    <Sidebar collapsible="icon" {...props}>
      {branding}

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t('nav.overview')}
                asChild
                isActive={isActive('/')}
                className="transition-all duration-200 hover:bg-accent/60 active:scale-95 data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:shadow-sm"
              >
                <Link to="/" onClick={handleMenuItemClick}>
                  <IconLayoutDashboard className="text-sidebar-primary" />
                  <span className="font-medium">{t('nav.overview')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {pinnedItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t('sidebar.pinned', 'Pinned')}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pinnedItems.map((item) => {
                  const IconComponent = getIconComponent(item.icon)
                  const title = item.titleKey
                    ? t(item.titleKey, { defaultValue: item.titleKey })
                    : ''
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        tooltip={title}
                        asChild
                        isActive={isActive(item.url)}
                      >
                        <Link to={item.url} onClick={handleMenuItemClick}>
                          <IconComponent className="text-sidebar-primary" />
                          <span>{title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleGroups.map((group) => (
          <SidebarGroup key={group.id}>
            {isIconCollapsed ? (
              <SidebarGroupContent className="flex flex-col gap-2">
                {renderGroupItems(group.items)}
              </SidebarGroupContent>
            ) : (
              <Collapsible
                defaultOpen={!group.collapsed}
                className="group/collapsible"
              >
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground group-data-[state=open]:text-foreground">
                    <span className="text-xs font-bold uppercase tracking-wide">
                      {group.nameKey
                        ? t(group.nameKey, { defaultValue: group.nameKey })
                        : ''}
                    </span>
                    <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent className="flex flex-col gap-2">
                    {renderGroupItems(group.items)}
                  </SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            )}
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div
          className={`
            flex items-center gap-2 rounded-md border border-border/60 bg-gradient-to-r from-muted/40 to-muted/20 px-2 py-1.5 backdrop-blur-sm
            group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5
          `}
        >
          <ClusterSelector />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
