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
  hasNewVersion: boolean
  releaseUrl: string
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
