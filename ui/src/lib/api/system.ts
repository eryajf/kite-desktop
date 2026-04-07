import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../api-client'
import { fetchAPI } from './shared'

// Version information
export interface VersionInfo {
  version: string
  buildDate: string
  commitId: string
  hasNewVersion: boolean
  releaseUrl: string
}

export interface UpdateCheckInfo {
  currentVersion: string
  latestVersion: string
  comparison: 'update_available' | 'up_to_date' | 'local_newer' | 'uncomparable'
  hasNewVersion: boolean
  releaseUrl: string
  releaseNotes: string
  publishedAt: string
  ignored: boolean
  assetAvailable: boolean
  asset?: {
    name: string
    downloadUrl: string
    contentType?: string
    size?: number
  }
  checkedAt: string
}

export const fetchVersionInfo = (): Promise<VersionInfo> => {
  return fetchAPI<VersionInfo>('/version')
}

export const checkVersionUpdate = (
  force: boolean = true
): Promise<UpdateCheckInfo> => {
  return apiClient.post<UpdateCheckInfo>('/version/check-update', { force })
}

export const useVersionInfo = () => {
  return useQuery({
    queryKey: ['version-info'],
    queryFn: fetchVersionInfo,
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchInterval: 0, // No auto-refresh
  })
}
