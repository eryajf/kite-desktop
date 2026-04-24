import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GLOBAL_SEARCH_HISTORY_LIMIT,
  readGlobalSearchHistory,
  saveGlobalSearchHistoryEntry,
} from './global-search-history'

describe('global search history helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores history entries per cluster bucket', () => {
    saveGlobalSearchHistoryEntry('prod', {
      id: 'resource:/pods/default/api',
      type: 'resource',
      label: 'api',
      path: '/pods/default/api',
      query: 'api',
      resourceType: 'pods',
      namespace: 'default',
    })

    saveGlobalSearchHistoryEntry('dev', {
      id: 'resource:/pods/default/worker',
      type: 'resource',
      label: 'worker',
      path: '/pods/default/worker',
      query: 'worker',
      resourceType: 'pods',
      namespace: 'default',
    })

    expect(readGlobalSearchHistory('prod')).toHaveLength(1)
    expect(readGlobalSearchHistory('prod')[0]?.label).toBe('api')
    expect(readGlobalSearchHistory('dev')).toHaveLength(1)
    expect(readGlobalSearchHistory('dev')[0]?.label).toBe('worker')
  })

  it('moves repeated entries to the top and refreshes their metadata', () => {
    saveGlobalSearchHistoryEntry('prod', {
      id: 'resource:/pods/default/api',
      type: 'resource',
      label: 'api',
      path: '/pods/default/api',
      query: 'api',
      resourceType: 'pods',
      namespace: 'default',
    })

    vi.setSystemTime(new Date('2026-04-24T10:05:00.000Z'))

    saveGlobalSearchHistoryEntry('prod', {
      id: 'resource:/pods/default/api',
      type: 'resource',
      label: 'api-v2',
      path: '/pods/default/api',
      query: 'api-v2',
      resourceType: 'pods',
      namespace: 'default',
    })

    const history = readGlobalSearchHistory('prod')

    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      label: 'api-v2',
      query: 'api-v2',
    })
    expect(history[0]?.lastAccessedAt).toBe('2026-04-24T10:05:00.000Z')
  })

  it('keeps only the latest configured number of entries', () => {
    for (let index = 0; index < GLOBAL_SEARCH_HISTORY_LIMIT + 2; index += 1) {
      vi.setSystemTime(
        new Date(`2026-04-24T10:${String(index).padStart(2, '0')}:00.000Z`)
      )

      saveGlobalSearchHistoryEntry('prod', {
        id: `resource:/pods/default/app-${index}`,
        type: 'resource',
        label: `app-${index}`,
        path: `/pods/default/app-${index}`,
        query: `app-${index}`,
        resourceType: 'pods',
        namespace: 'default',
      })
    }

    const history = readGlobalSearchHistory('prod')

    expect(history).toHaveLength(GLOBAL_SEARCH_HISTORY_LIMIT)
    expect(history[0]?.label).toBe(`app-${GLOBAL_SEARCH_HISTORY_LIMIT + 1}`)
    expect(history.at(-1)?.label).toBe('app-2')
  })
})
