import { useCallback, useMemo, useState } from 'react'
import {
  IconEdit,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconServer,
  IconTrash,
} from '@tabler/icons-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Cluster } from '@/types/api'
import {
  ClusterConnectionTestResponse,
  ClusterCreateRequest,
  ClusterUpdateRequest,
  createCluster,
  deleteCluster,
  testClusterConnection,
  updateCluster,
  useClusterList,
} from '@/lib/api'
import { trackDesktopEvent } from '@/lib/analytics'
import { invalidateClusterQueries } from '@/lib/cluster-query'
import { translateClusterConnectionError } from '@/lib/cluster-connection-errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'

import { Action, ActionTable } from '../action-table'
import { ClusterDialog } from './cluster-dialog'

function getClusterAnalyticsPayload(
  clusterData: ClusterCreateRequest | ClusterUpdateRequest
) {
  return {
    cluster_type: clusterData.inCluster ? 'in_cluster' : 'external',
    has_prometheus: Boolean(clusterData.prometheusURL?.trim()),
    is_default: Boolean(clusterData.isDefault),
    enabled: !('enabled' in clusterData) || clusterData.enabled !== false,
  }
}

function getClusterConnectionTestPayload(
  cluster: Cluster
): ClusterCreateRequest {
  return {
    id: cluster.id,
    name: cluster.name,
    description: cluster.description,
    config: '',
    prometheusURL: cluster.prometheusURL,
    inCluster: cluster.inCluster,
    isDefault: cluster.isDefault,
  }
}

export function ClusterManagement() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: clusters = [], isLoading, error } = useClusterList()

  const [showClusterDialog, setShowClusterDialog] = useState(false)
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null)
  const [deletingCluster, setDeletingCluster] = useState<Cluster | null>(null)
  const [testingClusterId, setTestingClusterId] = useState<number | null>(null)

  const getClusterTypeBadge = useCallback(
    (cluster: Cluster) => {
      if (cluster.inCluster) {
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            {t('clusterManagement.type.inCluster', 'In-Cluster')}
          </Badge>
        )
      }
      return (
        <Badge
          variant="outline"
          className="bg-gray-50 text-gray-700 border-gray-200"
        >
          {t('clusterManagement.type.external', 'External')}
        </Badge>
      )
    },
    [t]
  )

  const getStatusBadge = useCallback(
    (cluster: Cluster) => {
      if (!cluster.enabled) {
        return (
          <Badge variant="secondary">
            {t('clusterManagement.status.disabled', 'Disabled')}
          </Badge>
        )
      }
      return (
        <Badge variant="default">
          {t('clusterManagement.status.enabled', 'Enabled')}
        </Badge>
      )
    },
    [t]
  )

  const getConnectionStatusBadge = useCallback(
    (cluster: Cluster) => {
      if (cluster.error) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive">
                {t('clusterManagement.connection.unreachable', 'Unreachable')}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs break-all">{cluster.error}</p>
            </TooltipContent>
          </Tooltip>
        )
      }

      if (cluster.version) {
        return (
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            {t('clusterManagement.connection.reachable', 'Reachable')}
          </Badge>
        )
      }

      return (
        <Badge variant="secondary">
          {t('clusterManagement.connection.unknown', 'Not checked')}
        </Badge>
      )
    },
    [t]
  )

  const handleTestClusterRowConnection = useCallback(
    async (cluster: Cluster) => {
      setTestingClusterId(cluster.id)
      const payload = getClusterConnectionTestPayload(cluster)

      try {
        await testClusterConnection(payload)
        trackDesktopEvent('cluster_management_test_connection', {
          result: 'success',
          source: 'list',
          ...getClusterAnalyticsPayload(payload),
        })
        await invalidateClusterQueries(queryClient)
        toast.success(
          t(
            'clusterManagement.messages.connectionReachable',
            'Cluster connection is reachable.'
          )
        )
      } catch (error) {
        trackDesktopEvent('cluster_management_test_connection', {
          result: 'error',
          source: 'list',
          ...getClusterAnalyticsPayload(payload),
        })
        await invalidateClusterQueries(queryClient)
        toast.error(translateClusterConnectionError(error, t))
      } finally {
        setTestingClusterId(null)
      }
    },
    [queryClient, t]
  )

  const columns = useMemo<ColumnDef<Cluster>[]>(
    () => [
      {
        id: 'name',
        header: t('clusterManagement.table.name', 'Name'),
        cell: ({ row: { original: cluster } }) => (
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{cluster.name}</span>
              {cluster.isDefault && (
                <Badge variant="secondary">
                  {t('common.default', 'Default')}
                </Badge>
              )}
            </div>
            {cluster.description && (
              <div className="text-sm text-muted-foreground">
                {cluster.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'version',
        header: t('common.version', 'Version'),
        cell: ({ row: { original: cluster } }) => {
          if (cluster.error) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive">
                    {t('common.error', 'Error')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs break-all">{cluster.error}</p>
                </TooltipContent>
              </Tooltip>
            )
          }
          return <Badge variant="secondary">{cluster.version || '-'}</Badge>
        },
      },
      {
        id: 'type',
        header: t('clusterManagement.table.type', 'Type'),
        cell: ({ row: { original: cluster } }) => getClusterTypeBadge(cluster),
      },
      {
        id: 'status',
        header: t('clusterManagement.table.status', 'Status'),
        cell: ({ row: { original: cluster } }) => (
          <div className="flex items-center gap-3">
            {getStatusBadge(cluster)}
          </div>
        ),
      },
      {
        id: 'connection',
        header: t('clusterManagement.table.connection', 'Connection'),
        cell: ({ row: { original: cluster } }) => {
          const isTesting = testingClusterId === cluster.id
          const testConnectionLabel = isTesting
            ? t('clusterManagement.actions.testingConnection', 'Testing...')
            : t('clusterManagement.actions.testConnection', 'Test Connection')

          return (
            <div className="flex items-center gap-2">
              {getConnectionStatusBadge(cluster)}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={testConnectionLabel}
                    title={testConnectionLabel}
                    onClick={() => void handleTestClusterRowConnection(cluster)}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <IconRefresh className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconPlugConnected className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{testConnectionLabel}</TooltipContent>
              </Tooltip>
            </div>
          )
        },
      },
      {
        id: 'Prometheus',
        header: t('clusterManagement.table.prometheus', 'Prometheus'),
        cell: ({ row: { original: cluster } }) => (
          <div className="text-sm text-muted-foreground">
            {cluster.prometheusURL
              ? t('common.yes', 'Yes')
              : t('common.no', 'No')}
          </div>
        ),
      },
    ],
    [
      getClusterTypeBadge,
      getConnectionStatusBadge,
      getStatusBadge,
      handleTestClusterRowConnection,
      t,
      testingClusterId,
    ]
  )

  const actions = useMemo<Action<Cluster>[]>(
    () => [
      {
        label: (
          <>
            <IconEdit className="h-4 w-4" />
            {t('common.edit', 'Edit')}
          </>
        ),
        onClick: (cluster) => {
          setEditingCluster(cluster)
          setShowClusterDialog(true)
        },
      },
      {
        label: (
          <div className="inline-flex items-center gap-2 text-destructive">
            <IconTrash className="h-4 w-4" />
            {t('common.delete', 'Delete')}
          </div>
        ),
        shouldDisable: (cluster) => cluster.isDefault,
        onClick: (cluster) => {
          setDeletingCluster(cluster)
        },
      },
    ],
    [t]
  )

  const createMutation = useMutation({
    mutationFn: createCluster,
    onSuccess: async (_result, variables) => {
      await invalidateClusterQueries(queryClient)
      trackDesktopEvent('cluster_management_save', {
        action: 'create',
        result: 'success',
        ...getClusterAnalyticsPayload(variables),
      })
      toast.success(
        t('clusterManagement.messages.created', 'Cluster created successfully')
      )
      setShowClusterDialog(false)
    },
    onError: (error: Error, variables) => {
      trackDesktopEvent('cluster_management_save', {
        action: 'create',
        result: 'error',
        ...getClusterAnalyticsPayload(variables),
      })
      toast.error(
        error.message ||
          t(
            'clusterManagement.messages.createError',
            'Failed to create cluster'
          )
      )
    },
  })

  // Update cluster mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ClusterUpdateRequest }) =>
      updateCluster(id, data),
    onSuccess: async (_result, variables) => {
      await invalidateClusterQueries(queryClient)
      trackDesktopEvent('cluster_management_save', {
        action: 'update',
        result: 'success',
        ...getClusterAnalyticsPayload(variables.data),
      })
      toast.success(
        t('clusterManagement.messages.updated', 'Cluster updated successfully')
      )
      setShowClusterDialog(false)
      setEditingCluster(null)
    },
    onError: (error: Error, variables) => {
      trackDesktopEvent('cluster_management_save', {
        action: 'update',
        result: 'error',
        ...getClusterAnalyticsPayload(variables.data),
      })
      toast.error(
        error.message ||
          t(
            'clusterManagement.messages.updateError',
            'Failed to update cluster'
          )
      )
    },
  })

  // Delete cluster mutation
  const deleteMutation = useMutation({
    mutationFn: deleteCluster,
    onSuccess: async () => {
      await invalidateClusterQueries(queryClient)
      trackDesktopEvent('cluster_management_delete', {
        result: 'success',
      })
      toast.success(
        t('clusterManagement.messages.deleted', 'Cluster deleted successfully')
      )
      setDeletingCluster(null)
    },
    onError: (error: Error) => {
      trackDesktopEvent('cluster_management_delete', {
        result: 'error',
      })
      toast.error(
        error.message ||
          t(
            'clusterManagement.messages.deleteError',
            'Failed to delete cluster'
          )
      )
    },
  })

  const handleSubmitCluster = (clusterData: ClusterCreateRequest) => {
    if (editingCluster) {
      // Update existing cluster - use the form data directly
      updateMutation.mutate({
        id: editingCluster.id,
        data: clusterData,
      })
    } else {
      // Create new cluster
      createMutation.mutate(clusterData)
    }
  }

  const handleTestClusterConnection = async (
    clusterData: ClusterCreateRequest
  ): Promise<ClusterConnectionTestResponse> => {
    try {
      const result = await testClusterConnection(clusterData)
      trackDesktopEvent('cluster_management_test_connection', {
        result: 'success',
        ...getClusterAnalyticsPayload(clusterData),
      })
      return result
    } catch (error) {
      trackDesktopEvent('cluster_management_test_connection', {
        result: 'error',
        ...getClusterAnalyticsPayload(clusterData),
      })
      throw error
    }
  }

  const handleDeleteCluster = () => {
    if (!deletingCluster) return
    deleteMutation.mutate(deletingCluster.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">
          {t('common.loading', 'Loading...')}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-destructive">
          {t('clusterManagement.errors.loadFailed', 'Failed to load clusters')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconServer className="h-5 w-5" />
                {t('clusterManagement.title', 'Cluster Management')}
              </CardTitle>
            </div>
            <Button
              onClick={() => {
                setEditingCluster(null)
                setShowClusterDialog(true)
              }}
              className="gap-2"
            >
              <IconPlus className="h-4 w-4" />
              {t('clusterManagement.actions.add', 'Add Cluster')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ActionTable data={clusters} columns={columns} actions={actions} />
          {clusters.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <IconServer className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {t('clusterManagement.empty.title', 'No clusters configured')}
              </p>
              <p className="text-sm mt-1">
                {t(
                  'clusterManagement.empty.description',
                  'Add your first cluster to get started'
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cluster Dialog (Add/Edit) */}
      <ClusterDialog
        open={showClusterDialog}
        onOpenChange={(open) => {
          setShowClusterDialog(open)
          if (!open) {
            setEditingCluster(null)
          }
        }}
        cluster={editingCluster}
        onSubmit={handleSubmitCluster}
        onTestConnection={handleTestClusterConnection}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={!!deletingCluster}
        onOpenChange={() => setDeletingCluster(null)}
        onConfirm={handleDeleteCluster}
        resourceName={deletingCluster?.name || ''}
        resourceType={t('clusterManagement.resourceType', 'cluster')}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
        additionalNote={t(
          'clusterManagement.deleteConfirmation',
          "This action will only remove the current cluster's configuration in kite and will not delete any cluster resources."
        )}
      />
    </div>
  )
}
