/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { trackEvent } from '@/lib/analytics'
import { getCurrentAnalyticsPageKey } from '@/lib/analytics-route'
import { clearClusterCookie, setClusterCookie } from '@/lib/cluster-cookie'
import {
  loadWorkspacePreference,
  updateWorkspacePreference,
} from '@/lib/desktop-preferences'
import { Cluster } from '@/types/api'
import { clusterQueryKey } from '@/lib/cluster-query'
import { withSubPath } from '@/lib/subpath'

const recentClustersStorageKey = 'recent-clusters'

interface ClusterContextType {
  clusters: Cluster[]
  currentCluster: string | null
  setCurrentCluster: (clusterName: string) => void
  isLoading: boolean
  isSwitching?: boolean
  error: Error | null
}

export const ClusterContext = createContext<ClusterContextType | undefined>(
  undefined
)

export const ClusterProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentCluster, setCurrentClusterState] = useState<string | null>(
    localStorage.getItem('current-cluster')
  )
  const queryClient = useQueryClient()
  const [isSwitching, setIsSwitching] = useState(false)

  const buildRecentClusters = (clusterName: string) => {
    const recentClusters = JSON.parse(
      localStorage.getItem(recentClustersStorageKey) || '[]'
    ) as string[]
    return [
      clusterName,
      ...recentClusters.filter((name) => name !== clusterName),
    ].slice(0, 8)
  }

  useEffect(() => {
    let cancelled = false

    const loadPreference = async () => {
      try {
        const preference = await loadWorkspacePreference()
        if (cancelled || !preference.currentCluster) {
          return
        }

        setCurrentClusterState(preference.currentCluster)
      } catch (error) {
        console.error('Failed to load workspace preference from storage:', error)
      }
    }

    void loadPreference()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (currentCluster) {
      setClusterCookie(currentCluster)
      return
    }
    clearClusterCookie()
  }, [currentCluster])

  // Fetch clusters from API (this request shouldn't need cluster header)
  const {
    data: clusters = [],
    isLoading,
    error,
  } = useQuery<Cluster[]>({
    queryKey: clusterQueryKey,
    queryFn: async () => {
      const response = await fetch(withSubPath('/api/v1/clusters'), {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}))
        const redirectUrl = response.headers.get('Location')
        if (redirectUrl) {
          window.location.href = redirectUrl
        }
        throw new Error(`${errorData.error || response.status}`)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`${errorData.error || response.status}`)
      }

      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Set default cluster if none is selected
  useEffect(() => {
    if (clusters.length > 0 && !currentCluster) {
      const defaultCluster = clusters.find((c) => c.isDefault)
      if (defaultCluster) {
        setCurrentClusterState(defaultCluster.name)
        setClusterCookie(defaultCluster.name)
        localStorage.setItem('current-cluster', defaultCluster.name)
        void updateWorkspacePreference((preference) => ({
          ...preference,
          currentCluster: defaultCluster.name,
          recentClusters:
            preference.recentClusters.length > 0
              ? preference.recentClusters
              : [defaultCluster.name],
        }))
      } else {
        // If no default cluster, use the first one
        setCurrentClusterState(clusters[0].name)
        localStorage.setItem('current-cluster', clusters[0].name)
        setClusterCookie(clusters[0].name)
        void updateWorkspacePreference((preference) => ({
          ...preference,
          currentCluster: clusters[0].name,
          recentClusters:
            preference.recentClusters.length > 0
              ? preference.recentClusters
              : [clusters[0].name],
        }))
      }
    }
    if (clusters.length === 0 && currentCluster) {
      setCurrentClusterState(null)
      localStorage.removeItem('current-cluster')
      clearClusterCookie()
      void updateWorkspacePreference((preference) => ({
        ...preference,
        currentCluster: '',
      }))
    }
    if (
      currentCluster &&
      clusters.length > 0 &&
      !clusters.some((c) => c.name === currentCluster)
    ) {
      // If current cluster is not in the list, reset it
      setCurrentClusterState(null)
      localStorage.removeItem('current-cluster')
      clearClusterCookie()
      void updateWorkspacePreference((preference) => ({
        ...preference,
        currentCluster: '',
      }))
    }
  }, [clusters, currentCluster])

  const setCurrentCluster = (clusterName: string) => {
    if (clusterName !== currentCluster && !isSwitching) {
      try {
        setIsSwitching(true)
        setCurrentClusterState(clusterName)
        localStorage.setItem('current-cluster', clusterName)
        const nextRecentClusters = buildRecentClusters(clusterName)
        localStorage.setItem(
          recentClustersStorageKey,
          JSON.stringify(nextRecentClusters)
        )
        setClusterCookie(clusterName)
        void updateWorkspacePreference((preference) => ({
          ...preference,
          currentCluster: clusterName,
          recentClusters: nextRecentClusters,
        }))
        trackEvent('cluster_switch', {
          runtime: 'desktop',
          page: getCurrentAnalyticsPageKey(),
        })
        setTimeout(async () => {
          await queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey[0] as string
              return !['user', 'auth', 'clusters'].includes(key)
            },
          })
          setIsSwitching(false)
          toast.success(`Switched to cluster: ${clusterName}`, {
            id: 'cluster-switch',
          })
        }, 300)
      } catch (error) {
        console.error('Failed to switch cluster:', error)
        setIsSwitching(false)
        toast.error('Failed to switch cluster', {
          id: 'cluster-switch',
        })
      }
    }
  }

  const value: ClusterContextType = {
    clusters,
    currentCluster,
    setCurrentCluster,
    isLoading,
    isSwitching,
    error: error as Error | null,
  }

  return (
    <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
  )
}
