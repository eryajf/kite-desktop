import type { ResourceHistory } from '@/types/api'

export function getResourceHistoryOperatorName(item: ResourceHistory): string {
  return item.operator?.username || '-'
}
