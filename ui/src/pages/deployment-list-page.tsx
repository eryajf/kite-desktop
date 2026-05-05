import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Deployment } from 'kubernetes-types/apps/v1'
import type { Affinity, Container, Toleration } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { aggregateContainerResources, getDeploymentStatus } from '@/lib/k8s'
import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'
import { ContainerImagesSummary } from '@/components/container-images-summary'
import { Badge } from '@/components/ui/badge'
import { DeploymentStatusIcon } from '@/components/deployment-status-icon'
import { DeploymentCreateDialog } from '@/components/editors/deployment-create-dialog'
import { ResourceMetadataDialog } from '@/components/editors/resource-metadata-dialog'
import { MetadataActionButton } from '@/components/metadata-action-button'
import { ResourceTable } from '@/components/resource-table'

function summarizeTolerations(tolerations?: Toleration[]) {
  if (!tolerations?.length) {
    return '-'
  }

  const first = tolerations[0]
  const firstSummary = [first.key, first.operator, first.effect]
    .filter(Boolean)
    .join(' ')

  return tolerations.length === 1
    ? firstSummary || '-'
    : `${firstSummary} +${tolerations.length - 1}`
}

function summarizeAffinity(affinity?: Affinity) {
  if (!affinity) {
    return '-'
  }

  const parts: string[] = []
  if (affinity.nodeAffinity) {
    parts.push('Node')
  }
  if (affinity.podAffinity) {
    parts.push('Pod')
  }
  if (affinity.podAntiAffinity) {
    parts.push('Pod Anti')
  }

  return parts.length > 0 ? parts.join(', ') : '-'
}

function summarizeResourceLimits(containers?: Container[]) {
  const limits = aggregateContainerResources(containers).limits
  if (!limits.cpu && !limits.memory) {
    return '-'
  }

  return [
    limits.cpu ? `CPU: ${limits.cpu}` : null,
    limits.memory ? `Memory: ${limits.memory}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function formatTimestampWithRelative(timestamp?: string) {
  if (!timestamp) {
    return '-'
  }

  return `${formatDate(timestamp)} (${formatRelativeTimeStrict(timestamp)})`
}

export function DeploymentListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [labelsDeployment, setLabelsDeployment] = useState<Deployment | null>(
    null
  )
  const [annotationsDeployment, setAnnotationsDeployment] =
    useState<Deployment | null>(null)

  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Deployment>()

  // Define columns for the deployment table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium app-link">
            <Link
              to={`/deployments/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.status?.readyReplicas ?? 0, {
        id: 'ready',
        header: t('deployments.ready'),
        cell: ({ row }) => {
          const status = row.original.status
          const ready = status?.readyReplicas || 0
          const desired = status?.replicas || 0
          return (
            <div>
              {ready} / {desired}
            </div>
          )
        },
      }),
      columnHelper.accessor('status.conditions', {
        header: t('common.status'),
        cell: ({ row }) => {
          const status = getDeploymentStatus(row.original)
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <DeploymentStatusIcon status={status} />
              {status}
            </Badge>
          )
        },
      }),
      columnHelper.display({
        id: 'labels',
        header: t('detail.fields.labels'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="labels"
            ariaLabel={t('deploymentList.manageLabels')}
            onClick={() => setLabelsDeployment(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'annotations',
        header: t('detail.fields.annotations'),
        meta: { align: 'left' },
        cell: ({ row }) => (
          <MetadataActionButton
            icon="annotations"
            ariaLabel={t('deploymentList.manageAnnotations')}
            onClick={() => setAnnotationsDeployment(row.original)}
          />
        ),
      }),
      columnHelper.display({
        id: 'tolerations',
        header: t('deploymentOverview.tolerations'),
        cell: ({ row }) =>
          summarizeTolerations(row.original.spec?.template?.spec?.tolerations),
      }),
      columnHelper.display({
        id: 'affinity',
        header: t('deploymentOverview.affinity'),
        cell: ({ row }) =>
          summarizeAffinity(row.original.spec?.template?.spec?.affinity),
      }),
      columnHelper.display({
        id: 'containers-and-images',
        header: t('deploymentOverview.containersAndImages'),
        cell: ({ row }) => (
          <ContainerImagesSummary
            containers={row.original.spec?.template?.spec?.containers}
          />
        ),
      }),
      columnHelper.display({
        id: 'resource-limits',
        header: t('deploymentOverview.resourceLimits'),
        cell: ({ row }) =>
          summarizeResourceLimits(row.original.spec?.template?.spec?.containers),
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        id: 'created',
        header: t('common.created'),
        cell: ({ getValue }) => formatTimestampWithRelative(getValue()),
      }),
    ],
    [columnHelper, t]
  )

  // Custom filter for deployment search
  const deploymentSearchFilter = useCallback(
    (deployment: Deployment, query: string) => {
      return (
        deployment.metadata!.name!.toLowerCase().includes(query) ||
        (deployment.metadata!.namespace?.toLowerCase() || '').includes(query)
      )
    },
    []
  )

  const handleCreateClick = () => {
    setIsCreateDialogOpen(true)
  }

  const handleCreateSuccess = (deployment: Deployment, namespace: string) => {
    // Navigate to the newly created deployment's detail page
    navigate(`/deployments/${namespace}/${deployment.metadata?.name}`)
  }

  return (
    <>
      <ResourceTable
        resourceName="Deployments"
        columns={columns}
        searchQueryFilter={deploymentSearchFilter}
        showCreateButton={true}
        onCreateClick={handleCreateClick}
        batchDeleteConfirmationValue={t(
          'deleteConfirmation.confirmDeleteKeyword'
        )}
      />

      <DeploymentCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <ResourceMetadataDialog
        open={Boolean(labelsDeployment)}
        onOpenChange={(open) => {
          if (!open) {
            setLabelsDeployment(null)
          }
        }}
        resourceType="deployments"
        resource={labelsDeployment}
        type="labels"
      />

      <ResourceMetadataDialog
        open={Boolean(annotationsDeployment)}
        onOpenChange={(open) => {
          if (!open) {
            setAnnotationsDeployment(null)
          }
        }}
        resourceType="deployments"
        resource={annotationsDeployment}
        type="annotations"
      />
    </>
  )
}
