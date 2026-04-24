export const GLOBAL_SEARCH_HISTORY_LIMIT = 10

const GLOBAL_SEARCH_HISTORY_STORAGE_PREFIX = 'global-search-history-v1'
const FALLBACK_CLUSTER_BUCKET = '__no_cluster__'

export type SearchHistoryEntryType = 'navigation' | 'resource'

export interface SearchHistoryEntry {
  id: string
  type: SearchHistoryEntryType
  label: string
  path: string
  query: string
  lastAccessedAt: string
  resourceType?: string
  namespace?: string
  groupLabel?: string
}

function getHistoryStorageKey(clusterName?: string | null) {
  const normalizedClusterName = clusterName?.trim() || FALLBACK_CLUSTER_BUCKET
  return `${GLOBAL_SEARCH_HISTORY_STORAGE_PREFIX}-${normalizedClusterName}`
}

function isSearchHistoryEntry(value: unknown): value is SearchHistoryEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Record<string, unknown>

  return (
    typeof entry.id === 'string' &&
    typeof entry.type === 'string' &&
    (entry.type === 'navigation' || entry.type === 'resource') &&
    typeof entry.label === 'string' &&
    typeof entry.path === 'string' &&
    typeof entry.query === 'string' &&
    typeof entry.lastAccessedAt === 'string'
  )
}

export type SearchHistoryEntryInput = Omit<SearchHistoryEntry, 'lastAccessedAt'>

export function readGlobalSearchHistory(
  clusterName?: string | null
): SearchHistoryEntry[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(getHistoryStorageKey(clusterName)) || '[]'
    )

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter(isSearchHistoryEntry)
      .sort((left, right) =>
        right.lastAccessedAt.localeCompare(left.lastAccessedAt)
      )
      .slice(0, GLOBAL_SEARCH_HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function saveGlobalSearchHistoryEntry(
  clusterName: string | null | undefined,
  entry: SearchHistoryEntryInput
): SearchHistoryEntry[] {
  const nextEntry: SearchHistoryEntry = {
    ...entry,
    query: entry.query.trim(),
    lastAccessedAt: new Date().toISOString(),
  }

  const nextHistory = [
    nextEntry,
    ...readGlobalSearchHistory(clusterName).filter(
      (historyEntry) => historyEntry.id !== nextEntry.id
    ),
  ].slice(0, GLOBAL_SEARCH_HISTORY_LIMIT)

  localStorage.setItem(
    getHistoryStorageKey(clusterName),
    JSON.stringify(nextHistory)
  )

  return nextHistory
}
