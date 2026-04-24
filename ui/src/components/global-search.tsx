import { ComponentType, useCallback, useEffect, useMemo, useState } from 'react'
import { useRuntime } from '@/contexts/runtime-context'
import { useSidebarConfig } from '@/contexts/sidebar-config-context'
import {
  IconArrowsHorizontal,
  IconBox,
  IconBoxMultiple,
  IconCheck,
  IconLayoutDashboard,
  IconLoadBalancer,
  IconLoader,
  IconLock,
  IconMap,
  IconMoon,
  IconNetwork,
  IconPlayerPlay,
  IconRocket,
  IconRoute,
  IconRouter,
  IconSearch,
  IconServer,
  IconServer2,
  IconSettings,
  IconShield,
  IconStar,
  IconStarFilled,
  IconSun,
  IconTopologyBus,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Cluster } from '@/types/api'
import { trackDesktopEvent } from '@/lib/analytics'
import { globalSearch, SearchResult } from '@/lib/api'
import {
  readGlobalSearchHistory,
  saveGlobalSearchHistoryEntry,
  SearchHistoryEntry,
  SearchHistoryEntryInput,
} from '@/lib/global-search-history'
import { useCluster } from '@/hooks/use-cluster'
import { useFavorites } from '@/hooks/use-favorites'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppearance } from '@/components/appearance-provider'

import { GlobalSearchMode, useGlobalSearch } from './global-search-provider'

const recentClustersStorageKey = 'recent-clusters'

// Define resource types and their display properties
const RESOURCE_CONFIG: Record<
  string,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  pods: { label: 'nav.pods', icon: IconBox },
  deployments: { label: 'nav.deployments', icon: IconRocket },
  services: { label: 'nav.services', icon: IconNetwork },
  configmaps: { label: 'nav.configMaps', icon: IconMap },
  secrets: { label: 'nav.secrets', icon: IconLock },
  namespaces: {
    label: 'nav.namespaces',
    icon: IconBoxMultiple,
  },
  nodes: { label: 'nav.nodes', icon: IconServer2 },
  jobs: { label: 'nav.jobs', icon: IconPlayerPlay },
  ingresses: { label: 'nav.ingresses', icon: IconRouter },
  networkpolicies: { label: 'nav.networkpolicies', icon: IconShield },
  gateways: { label: 'nav.gateways', icon: IconLoadBalancer },
  httproutes: { label: 'nav.httproutes', icon: IconRoute },
  daemonsets: {
    label: 'nav.daemonsets',
    icon: IconTopologyBus,
  },
  horizontalpodautoscalers: {
    label: 'nav.horizontalpodautoscalers',
    icon: IconArrowsHorizontal,
  },
}

interface SidebarSearchItem {
  id: string
  title: string
  url: string
  Icon: React.ComponentType<{ className?: string }>
  groupLabel?: string
  searchText: string
  isPinned: boolean
}

interface ActionSearchItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  searchText: string
  onSelect: () => void
  defaultVisible?: boolean
  closeOnSelect?: boolean
  shortcut?: string
}

interface ClusterSearchItem {
  id: string
  cluster: Cluster
  searchText: string
  clusterNameText: string
  subtitle: string
  disabled: boolean
  isCurrent: boolean
}

interface GlobalSearchProps {
  open: boolean
  mode: GlobalSearchMode
  onOpenChange: (open: boolean) => void
}

function readRecentClusters(): string[] {
  try {
    return JSON.parse(
      localStorage.getItem(recentClustersStorageKey) || '[]'
    ) as string[]
  } catch {
    return []
  }
}

function isClusterIntent(query: string) {
  return ['cluster', 'clusters', 'switch', 'workspace', '集群', '切换'].some(
    (term) => query.includes(term)
  )
}

export function GlobalSearch({ open, mode, onOpenChange }: GlobalSearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>([])
  const [isLoading, setIsLoading] = useState(false)
  const [recentClusters, setRecentClusters] = useState<string[]>([])
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([])
  const navigate = useNavigate()
  const { isDesktop } = useRuntime()
  const { config, getIconComponent } = useSidebarConfig()
  const { setTheme, actualTheme } = useAppearance()
  const { openSearch } = useGlobalSearch()
  const {
    clusters,
    currentCluster,
    setCurrentCluster,
    isSwitching,
    isLoading: isClusterLoading,
  } = useCluster()

  // Simple theme toggle function
  const toggleTheme = useCallback(() => {
    if (actualTheme === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }, [actualTheme, setTheme])

  const sidebarItems = useMemo<SidebarSearchItem[]>(() => {
    const overviewTitle = t('nav.overview')
    const items: SidebarSearchItem[] = [
      {
        id: 'sidebar-overview',
        title: overviewTitle,
        url: '/',
        Icon: IconLayoutDashboard,
        groupLabel: undefined,
        searchText: `${overviewTitle} overview dashboard /`.toLowerCase(),
        isPinned: false,
      },
      ...(isDesktop
        ? [
            {
              id: 'settings',
              title: t('settings.nav', 'Settings'),
              url: '/settings',
              Icon: IconSettings,
              groupLabel: 'Settings',
              searchText:
                `${t('settings.nav', 'Settings')} desktop`.toLowerCase(),
              isPinned: false,
            },
            {
              id: 'desktop',
              title: t('settings.tabs.desktop', 'Desktop'),
              url: '/settings?tab=desktop',
              Icon: IconSettings,
              groupLabel: 'Settings',
              searchText:
                `${t('settings.tabs.desktop', 'Desktop')} settings desktop`.toLowerCase(),
              isPinned: false,
            },
            {
              id: 'general',
              title: t('settings.tabs.general', 'General'),
              url: '/settings?tab=general',
              Icon: IconSettings,
              groupLabel: 'Settings',
              searchText:
                `${t('settings.tabs.general', 'General')} settings general`.toLowerCase(),
              isPinned: false,
            },
            {
              id: 'clusters',
              title: t('settings.tabs.clusters', 'Cluster'),
              url: '/settings?tab=clusters',
              Icon: IconSettings,
              groupLabel: 'Settings',
              searchText:
                `${t('settings.tabs.clusters', 'Cluster')} settings cluster desktop`.toLowerCase(),
              isPinned: false,
            },
            {
              id: 'templates',
              title: t('settings.tabs.templates', 'Templates'),
              url: '/settings?tab=templates',
              Icon: IconSettings,
              groupLabel: 'Settings',
              searchText:
                `${t('settings.tabs.templates', 'Templates')} settings templates desktop`.toLowerCase(),
              isPinned: false,
            },
          ]
        : []),
    ]

    if (!config) {
      return items
    }

    const pinnedItems = new Set(config.pinnedItems)

    config.groups.forEach((group) => {
      const groupLabel = group.nameKey
        ? t(group.nameKey, { defaultValue: group.nameKey })
        : ''

      group.items
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach((item) => {
          const title = item.titleKey
            ? t(item.titleKey, { defaultValue: item.titleKey })
            : item.id
          const Icon = getIconComponent(item.icon) as ComponentType<{
            className?: string | undefined
          }>
          const searchTerms = [title, groupLabel, item.url, item.titleKey]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          items.push({
            id: item.id,
            title,
            url: item.url,
            Icon,
            groupLabel,
            searchText: searchTerms,
            isPinned: pinnedItems.has(item.id),
          })
        })
    })

    return items
  }, [config, getIconComponent, isDesktop, t])

  const sidebarResults = useMemo(() => {
    if (mode === 'cluster') {
      return []
    }

    const trimmedQuery = query.trim().toLowerCase()
    if (!trimmedQuery) {
      return []
    }

    return sidebarItems
      .filter((item) => item.searchText.includes(trimmedQuery))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1
        }
        return a.title.localeCompare(b.title)
      })
  }, [mode, query, sidebarItems])

  const actionItems: ActionSearchItem[] = useMemo(() => {
    return [
      ...(clusters.length > 1
        ? [
            {
              id: 'switch-cluster-mode',
              label: t('globalSearch.switchClusterMode'),
              icon: IconServer,
              searchText:
                'switch cluster clusters workspace env 集群 切换 工作区 环境'.toLocaleLowerCase(),
              defaultVisible: true,
              closeOnSelect: false,
              shortcut: '⌘⇧K',
              onSelect: () => {
                setQuery('')
                openSearch('cluster')
              },
            },
          ]
        : []),
      {
        id: 'toggle-theme',
        label: t('globalSearch.toggleTheme'),
        icon: actualTheme === 'dark' ? IconSun : IconMoon,
        searchText: 'toggle theme switch mode light dark'.toLocaleLowerCase(),
        onSelect: toggleTheme,
      },
    ]
  }, [actualTheme, clusters, t, toggleTheme, openSearch])

  const actionResults = useMemo(() => {
    if (mode === 'cluster') {
      return []
    }

    const trimmedQuery = query.trim().toLowerCase()
    if (!trimmedQuery) {
      return actionItems.filter((item) => item.defaultVisible)
    }

    return actionItems.filter((item) => item.searchText.includes(trimmedQuery))
  }, [actionItems, mode, query])

  const historyResults = useMemo(() => {
    if (mode === 'cluster' || query.trim().length > 0) {
      return []
    }

    return searchHistory
  }, [mode, query, searchHistory])

  const clusterResults = useMemo<ClusterSearchItem[]>(() => {
    if (clusters.length === 0) {
      return []
    }

    const recentClusterOrder = new Map(
      recentClusters.map((clusterName, index) => [clusterName, index])
    )

    const sortedClusters = [...clusters].sort((left, right) => {
      if (left.name === currentCluster) {
        return -1
      }
      if (right.name === currentCluster) {
        return 1
      }

      const leftRecentIndex = recentClusterOrder.get(left.name) ?? Infinity
      const rightRecentIndex = recentClusterOrder.get(right.name) ?? Infinity
      if (leftRecentIndex !== rightRecentIndex) {
        return leftRecentIndex - rightRecentIndex
      }

      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })

    const normalizedQuery = query.trim().toLowerCase()
    const items = sortedClusters.map((cluster) => ({
      id: `cluster-${cluster.name}`,
      cluster,
      clusterNameText: cluster.name.toLowerCase(),
      searchText: [
        cluster.name,
        cluster.description,
        cluster.version,
        cluster.error,
        cluster.isDefault ? 'default 默认' : '',
        cluster.name === currentCluster ? 'current 当前' : '',
        'cluster clusters switch 集群 切换',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      subtitle:
        cluster.error ||
        cluster.description ||
        cluster.version ||
        t('globalSearch.clusterReady'),
      disabled:
        !!cluster.error ||
        isSwitching ||
        isClusterLoading ||
        cluster.name === currentCluster,
      isCurrent: cluster.name === currentCluster,
    }))

    if (mode === 'cluster') {
      if (!normalizedQuery) {
        return items
      }
      return items.filter((item) =>
        item.clusterNameText.includes(normalizedQuery)
      )
    }

    if (!normalizedQuery) {
      return []
    }

    const matches = items.filter((item) =>
      item.searchText.includes(normalizedQuery)
    )
    if (matches.length === 0) {
      return []
    }

    return isClusterIntent(normalizedQuery) ||
      matches.some((item) =>
        item.cluster.name.toLowerCase().includes(normalizedQuery)
      )
      ? matches
      : []
  }, [
    clusters,
    currentCluster,
    isClusterLoading,
    isSwitching,
    mode,
    query,
    recentClusters,
    t,
  ])

  // Use favorites hook
  const {
    favorites,
    isFavorite,
    toggleFavorite: toggleResourceFavorite,
  } = useFavorites()

  // Handle favorite toggle
  const toggleFavorite = useCallback(
    async (result: SearchResult, event: React.MouseEvent) => {
      event.stopPropagation() // Prevent item selection

      await toggleResourceFavorite(result)
    },
    [toggleResourceFavorite]
  )

  // Debounced search function
  const performSearch = useCallback(
    async (searchQuery: string) => {
      try {
        setIsLoading(true)
        const response = await globalSearch(searchQuery, { limit: 10 })
        setResults(response.results)
        trackDesktopEvent('global_search_query', {
          mode,
          query_length: searchQuery.trim().length,
          result_count: response.results.length,
        })
      } catch (error) {
        console.error('Search failed:', error)
        setResults([])
        trackDesktopEvent('global_search_query', {
          mode,
          query_length: searchQuery.trim().length,
          result_count: 0,
          result: 'error',
        })
      } finally {
        setIsLoading(false)
      }
    },
    [mode]
  )

  const saveHistoryEntry = useCallback(
    (entry: SearchHistoryEntryInput) => {
      const nextHistory = saveGlobalSearchHistoryEntry(currentCluster, entry)
      setSearchHistory(nextHistory)
    },
    [currentCluster]
  )

  // Debounce search calls
  useEffect(() => {
    if (mode === 'cluster') {
      setIsLoading(false)
      setResults([])
      return
    }

    if (query.length > 0) {
      setResults(null)
    }
    if (!query || query.length < 2) {
      if (query.length === 0) {
        setResults(favorites)
      }
      return
    }
    setIsLoading(true)
    const timeoutId = setTimeout(() => {
      performSearch(query)
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [favorites, mode, performSearch, query])

  // Handle item selection
  const handleSelect = useCallback(
    (
      path: string,
      itemType: 'navigation' | 'resource' | 'action' | 'cluster',
      data: Record<string, string | number | boolean> = {},
      historyEntry?: SearchHistoryEntryInput
    ) => {
      if (historyEntry) {
        saveHistoryEntry(historyEntry)
      }
      trackDesktopEvent('global_search_select', {
        mode,
        item_type: itemType,
        ...data,
      })
      navigate(path)
      onOpenChange(false)
      setQuery('')
    },
    [mode, navigate, onOpenChange, saveHistoryEntry]
  )

  // Clear state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setIsLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setRecentClusters(readRecentClusters())
      setSearchHistory(readGlobalSearchHistory(currentCluster))
    }
  }, [currentCluster, open, mode])

  useEffect(() => {
    if (open && query === '' && mode === 'all') {
      setResults(favorites) // Show favorites when dialog opens
    }
  }, [favorites, mode, open, query])

  const placeholder =
    mode === 'cluster'
      ? t('globalSearch.clusterPlaceholder')
      : t('globalSearch.placeholder')

  const title =
    mode === 'cluster'
      ? t('globalSearch.clusterTitle')
      : t('globalSearch.title')

  const description =
    mode === 'cluster'
      ? t('globalSearch.clusterDescription')
      : t('globalSearch.description')

  const handleClusterSelect = useCallback(
    (clusterName: string) => {
      if (isSwitching || isClusterLoading || clusterName === currentCluster) {
        return
      }
      trackDesktopEvent('global_search_select', {
        mode,
        item_type: 'cluster',
      })
      setCurrentCluster(clusterName)
      onOpenChange(false)
      setQuery('')
    },
    [
      currentCluster,
      isClusterLoading,
      isSwitching,
      mode,
      onOpenChange,
      setCurrentCluster,
    ]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:p-0">
        <Command shouldFilter={false} className="rounded-none">
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <IconLoader className="h-4 w-4 animate-spin" />
                  <span>{t('globalSearch.searching')}</span>
                </div>
              ) : mode === 'cluster' ? (
                t('globalSearch.noClusterResults')
              ) : query.length < 2 ? (
                t('globalSearch.emptyHint')
              ) : (
                t('globalSearch.noResults')
              )}
            </CommandEmpty>

            {mode !== 'cluster' && sidebarResults.length > 0 && (
              <CommandGroup heading={t('globalSearch.navigation')}>
                {sidebarResults.map((item) => {
                  const Icon = item.Icon
                  return (
                    <CommandItem
                      key={`nav-${item.id}`}
                      value={`${item.title} ${item.groupLabel || ''} ${item.url}`}
                      onSelect={() =>
                        handleSelect(
                          item.url,
                          'navigation',
                          {
                            entry_id: item.id,
                          },
                          {
                            id: `navigation:${item.id}`,
                            type: 'navigation',
                            label: item.title,
                            path: item.url,
                            query,
                            groupLabel: item.groupLabel,
                          }
                        )
                      }
                      className="flex items-center gap-3 py-3"
                    >
                      <Icon className="h-4 w-4 text-sidebar-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.title}</span>
                          {item.groupLabel ? (
                            <Badge className="text-xs" variant="outline">
                              {item.groupLabel}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.url}
                        </div>
                      </div>
                      {item.isPinned ? (
                        <Badge className="text-xs" variant="secondary">
                          {t('sidebar.pinned', 'Pinned')}
                        </Badge>
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {historyResults.length > 0 && (
              <CommandGroup heading={t('globalSearch.history')}>
                {historyResults.map((entry) => {
                  const resourceConfig =
                    entry.type === 'resource'
                      ? RESOURCE_CONFIG[entry.resourceType || ''] || {
                          label: entry.resourceType || 'resource',
                          icon: IconBox,
                        }
                      : null
                  const Icon = resourceConfig?.icon || IconSearch
                  const subtitle = [
                    entry.query
                      ? t('globalSearch.historyQuery', {
                          query: entry.query,
                        })
                      : '',
                    entry.type === 'resource' && entry.namespace
                      ? `${t('detail.fields.namespace')}: ${entry.namespace}`
                      : entry.type === 'navigation'
                        ? entry.path
                        : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')

                  return (
                    <CommandItem
                      key={entry.id}
                      value={`${entry.label} ${entry.query} ${entry.path} ${entry.resourceType || ''}`}
                      onSelect={() =>
                        handleSelect(
                          entry.path,
                          entry.type,
                          {
                            selection_source: 'history',
                            ...(entry.type === 'resource' && entry.resourceType
                              ? { resource_type: entry.resourceType }
                              : {}),
                          },
                          {
                            ...entry,
                          }
                        )
                      }
                      className="flex items-center gap-3 py-3"
                    >
                      <Icon className="h-4 w-4 text-sidebar-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.label}</span>
                          <Badge className="text-xs" variant="outline">
                            {entry.type === 'resource' && resourceConfig
                              ? t(resourceConfig.label)
                              : t('globalSearch.navigation')}
                          </Badge>
                        </div>
                        {subtitle ? (
                          <div className="text-xs text-muted-foreground mt-1">
                            {subtitle}
                          </div>
                        ) : null}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {mode !== 'cluster' && actionResults.length > 0 && (
              <CommandGroup heading={t('globalSearch.actions')}>
                {actionResults.map((actionOption) => (
                  <CommandItem
                    key={actionOption.id}
                    value={`${actionOption.label} theme toggle mode`}
                    onSelect={() => {
                      trackDesktopEvent('global_search_select', {
                        mode,
                        item_type: 'action',
                        action_id: actionOption.id,
                      })
                      actionOption.onSelect()
                      if (actionOption.closeOnSelect !== false) {
                        onOpenChange(false)
                        setQuery('')
                      }
                    }}
                    className="flex items-center gap-3 py-3"
                  >
                    <actionOption.icon className="h-4 w-4 text-sidebar-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {actionOption.label}
                        </span>
                        {actionOption.id === 'toggle-theme' && (
                          <Badge className="text-xs" variant="outline">
                            {actualTheme === 'dark'
                              ? 'Switch to Light'
                              : 'Switch to Dark'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {actionOption.shortcut ? (
                      <CommandShortcut>{actionOption.shortcut}</CommandShortcut>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {clusterResults.length > 0 && (
              <CommandGroup heading={t('globalSearch.clusters')}>
                {clusterResults.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.clusterNameText}
                    disabled={item.disabled}
                    onSelect={() => handleClusterSelect(item.cluster.name)}
                    className="flex items-center gap-3 py-3"
                  >
                    <IconServer className="h-4 w-4 text-sidebar-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.cluster.name}</span>
                        {item.isCurrent ? (
                          <Badge className="text-xs" variant="secondary">
                            {t('globalSearch.current')}
                          </Badge>
                        ) : null}
                        {item.cluster.isDefault ? (
                          <Badge className="text-xs" variant="outline">
                            {t('clusterSelector.default')}
                          </Badge>
                        ) : null}
                        {item.cluster.error ? (
                          <Badge className="text-xs" variant="destructive">
                            {t('clusterSelector.syncError')}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.subtitle}
                      </div>
                    </div>
                    {item.isCurrent ? (
                      <IconCheck className="h-4 w-4 text-sidebar-primary" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {mode !== 'cluster' && results && results.length > 0 && (
              <CommandGroup
                heading={
                  query.length < 2
                    ? t('globalSearch.favorites')
                    : t('globalSearch.resources')
                }
              >
                {results.map((result) => {
                  const config = RESOURCE_CONFIG[result.resourceType] || {
                    label: result.resourceType,
                    icon: IconBox, // Default icon if not found
                  }
                  const Icon = config.icon
                  const isFav = isFavorite(result)
                  const path = result.namespace
                    ? `/${result.resourceType}/${result.namespace}/${result.name}`
                    : `/${result.resourceType}/${result.name}`
                  return (
                    <CommandItem
                      key={result.id}
                      value={`${result.name} ${result.namespace || ''} ${result.resourceType} ${
                        RESOURCE_CONFIG[result.resourceType]?.label ||
                        result.resourceType
                      }`}
                      onSelect={() =>
                        handleSelect(
                          path,
                          'resource',
                          {
                            resource_type: result.resourceType,
                          },
                          {
                            id: `resource:${path}`,
                            type: 'resource',
                            label: result.name,
                            path,
                            query,
                            resourceType: result.resourceType,
                            namespace: result.namespace,
                          }
                        )
                      }
                      className="flex items-center gap-3 py-3"
                    >
                      <Icon className="h-4 w-4 text-sidebar-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{result.name}</span>
                          <Badge className="text-xs">
                            {RESOURCE_CONFIG[result.resourceType]?.label
                              ? t(
                                  RESOURCE_CONFIG[result.resourceType]
                                    .label as string
                                )
                              : result.resourceType}
                          </Badge>
                        </div>
                        {result.namespace && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {t('detail.fields.namespace')}: {result.namespace}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          void toggleFavorite(result, e)
                        }}
                        className="p-1 hover:bg-accent rounded transition-colors z-10 relative"
                      >
                        {isFav ? (
                          <IconStarFilled className="h-3 w-3 text-yellow-500" />
                        ) : (
                          <IconStar className="h-3 w-3 text-muted-foreground opacity-50" />
                        )}
                      </button>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
