import { IconCheck, IconChevronDown, IconServer } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { useCluster } from '@/hooks/use-cluster'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ShortcutTooltipContent } from '@/components/shortcut-tooltip-content'
import { useSidebar } from '@/components/ui/sidebar'

function getClusterSwitchShortcutLabel() {
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) {
    return '⌘⇧K'
  }

  return 'Ctrl+Shift+K'
}

export function ClusterSelector() {
  const { t } = useTranslation()
  const { state, isMobile } = useSidebar()
  const {
    clusters,
    currentCluster,
    setCurrentCluster,
    isSwitching,
    isLoading,
  } = useCluster()

  if (isLoading || isSwitching) {
    return (
      <div className="flex items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        {isSwitching && (
          <span className="ml-2 text-sm text-muted-foreground">
            {t('clusterSelector.switching')}
          </span>
        )}
      </div>
    )
  }

  const currentClusterData = clusters.find((c) => c.name === currentCluster)
  const isSidebarCollapsed = state === 'collapsed' && !isMobile

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'flex h-8 max-w-full items-center gap-2 px-3 focus-visible:border-transparent focus-visible:ring-0',
                isSidebarCollapsed && 'w-8 justify-center px-0'
              )}
              title={
                isSidebarCollapsed
                  ? currentClusterData?.name ||
                    (clusters.length === 0
                      ? t('clusterSelector.noneAvailable', 'No clusters configured')
                      : t('clusterSelector.select'))
                  : undefined
              }
              disabled={isSwitching}
            >
              <IconServer className="h-4 w-4" />
              <span
                className={cn(
                  'truncate text-sm font-medium',
                  isSidebarCollapsed && 'hidden'
                )}
              >
                {isSwitching
                  ? t('clusterSelector.switching')
                  : currentClusterData?.name ||
                    (clusters.length === 0
                      ? t(
                          'clusterSelector.noneAvailable',
                          'No clusters configured'
                        )
                      : t('clusterSelector.select'))}
              </span>
              <IconChevronDown
                className={cn('h-3 w-3 opacity-50', isSidebarCollapsed && 'hidden')}
              />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <ShortcutTooltipContent
          side="top"
          label={t('clusterSelector.quickSwitch')}
          shortcut={getClusterSwitchShortcutLabel()}
        />
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60">
        {clusters.length === 0 ? (
          <>
            <DropdownMenuLabel>
              {t('clusterSelector.noneAvailable', 'No clusters configured')}
            </DropdownMenuLabel>
            <DropdownMenuItem disabled>
              {t('cluster.goToSettings', 'Go to cluster settings')}
            </DropdownMenuItem>
          </>
        ) : null}
        {clusters.length > 0 ? (
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>{t('clusterSelector.quickSwitch')}</span>
            <kbd className="bg-muted text-muted-foreground pointer-events-none flex h-5 items-center justify-center rounded border px-1 font-sans text-[0.7rem] font-medium">
              {getClusterSwitchShortcutLabel()}
            </kbd>
          </DropdownMenuLabel>
        ) : null}
        {clusters.map((cluster) => (
          <DropdownMenuItem
            key={cluster.name}
            onClick={() => setCurrentCluster(cluster.name)}
            disabled={!!cluster.error}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-medium">{cluster.name}</span>
                {cluster.isDefault && (
                  <Badge className="text-xs">
                    {t('clusterSelector.default')}
                  </Badge>
                )}
                {cluster.error && (
                  <Badge variant="destructive" className="text-xs">
                    {t('clusterSelector.syncError')}
                  </Badge>
                )}
              </div>
              <span
                className={cn(
                  'text-xs truncate',
                  cluster.error ? 'text-red-500' : 'text-muted-foreground'
                )}
                title={cluster.error}
              >
                {cluster.error || cluster.version}
              </span>
            </div>
            {currentCluster === cluster.name && (
              <IconCheck className="h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
