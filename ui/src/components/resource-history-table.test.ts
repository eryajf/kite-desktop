import { describe, expect, it } from 'vitest'

import { getResourceHistoryOperatorName } from './resource-history-table'
import type { ResourceHistory } from '@/types/api'

function createHistory(
  overrides: Partial<ResourceHistory> = {}
): ResourceHistory {
  return {
    id: 1,
    clusterName: 'local',
    resourceType: 'deployments',
    resourceName: 'demo',
    namespace: 'default',
    operationType: 'update',
    operationSource: 'manual',
    resourceYaml: '',
    previousYaml: '',
    success: true,
    errorMessage: '',
    operatorId: 1,
    operator: {
      username: 'alice',
      provider: 'local',
    },
    createdAt: '2026-04-06T00:00:00Z',
    updatedAt: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

describe('getResourceHistoryOperatorName', () => {
  it('returns the operator username when present', () => {
    expect(getResourceHistoryOperatorName(createHistory())).toBe('alice')
  })

  it('falls back when the operator relation is missing', () => {
    expect(
      getResourceHistoryOperatorName(createHistory({ operator: null }))
    ).toBe('-')
  })
})
