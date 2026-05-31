import { type ReactNode } from 'react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Deployment } from 'kubernetes-types/apps/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'

import { DeploymentListPage } from './deployment-list-page'

const mockNavigate = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockInvalidateQueries = vi.fn()
const mockPatchResource = vi.fn()
const mockOpenSession = vi.fn()
const mockOpenWorkloadTerminal = vi.fn()
const mockT = (key: string) => key
const mockResourceTable = vi.fn(
  ({
    onCreateClick,
    showCreateButton,
  }: {
    onCreateClick?: () => void
    showCreateButton?: boolean
  }) => (
    <div>
      <span>{showCreateButton ? 'create-enabled' : 'create-disabled'}</span>
      <button onClick={onCreateClick}>open-create</button>
    </div>
  )
)

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: mockT,
    }),
  }
})

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  )

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  }
})

vi.mock('@/lib/desktop', () => ({
  copyTextToClipboard: (value: string) => mockCopyTextToClipboard(value),
}))

vi.mock('@/lib/api', () => ({
  patchResource: (...args: unknown[]) => mockPatchResource(...args),
}))

vi.mock('@/contexts/terminal-context', () => ({
  useTerminal: () => ({
    openSession: mockOpenSession,
  }),
}))

vi.mock('@/lib/workload-terminal', () => ({
  openWorkloadTerminal: (...args: unknown[]) =>
    mockOpenWorkloadTerminal(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (value: string) => mockToastSuccess(value),
    error: (value: string) => mockToastError(value),
  },
}))

vi.mock('@/components/resource-table', () => ({
  ResourceTable: (props: {
    onCreateClick?: () => void
    showCreateButton?: boolean
  }) => mockResourceTable(props),
}))

vi.mock('@/components/editors/deployment-create-dialog', () => ({
  DeploymentCreateDialog: ({
    open,
    onSuccess,
  }: {
    open: boolean
    onSuccess: (deployment: Deployment, namespace: string) => void
  }) =>
    open ? (
      <div>
        <span>deployment-create-dialog</span>
        <button
          onClick={() =>
            onSuccess(
              {
                metadata: {
                  name: 'web',
                },
              } as Deployment,
              'default'
            )
          }
        >
          finish-create
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/editors/resource-metadata-dialog', () => ({
  ResourceMetadataDialog: ({
    open,
    type,
    resource,
  }: {
    open: boolean
    type: 'labels' | 'annotations'
    resource?: { metadata?: { name?: string } } | null
  }) =>
    open ? (
      <div>
        <span>{`resource-metadata-dialog-${type}`}</span>
        <span>{resource?.metadata?.name}</span>
      </div>
    ) : null,
}))

vi.mock('@/components/container-edit-dialog', () => ({
  ContainerEditDialog: ({
    open,
    deployment,
    onSaveDeployment,
  }: {
    open: boolean
    deployment?: { metadata?: { name?: string } }
    onSaveDeployment?: (deployment: Deployment) => void | Promise<void>
  }) =>
    open ? (
      <div>
        <span>container-edit-dialog</span>
        <span>{deployment?.metadata?.name}</span>
        <button
          onClick={() =>
            onSaveDeployment?.({
              metadata: deployment?.metadata,
              spec: {
                template: {
                  spec: {
                    containers: [
                      {
                        name: 'api',
                        image: 'nginx:2.0',
                      },
                    ],
                  },
                },
              },
            } as Deployment)
          }
        >
          save-container-edit
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/resource-delete-confirmation-dialog', () => ({
  ResourceDeleteConfirmationDialog: ({
    open,
    resourceName,
  }: {
    open: boolean
    resourceName: string
  }) =>
    open ? (
      <div>
        <span>resource-delete-confirmation-dialog</span>
        <span>{resourceName}</span>
      </div>
    ) : null,
}))

describe('DeploymentListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T10:00:00.000Z'))
    mockNavigate.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    mockInvalidateQueries.mockReset()
    mockPatchResource.mockReset()
    mockOpenSession.mockReset()
    mockOpenWorkloadTerminal.mockReset()
    mockResourceTable.mockClear()
  })

  it('shows create action and navigates after deployment creation', () => {
    render(<DeploymentListPage />)

    expect(screen.getByText('create-enabled')).toBeInTheDocument()

    fireEvent.click(screen.getByText('open-create'))
    expect(screen.getByText('deployment-create-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByText('finish-create'))
    expect(mockNavigate).toHaveBeenCalledWith('/deployments/default/web')
  })

  it('renders deployment metadata columns alongside the data columns', () => {
    render(<DeploymentListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Deployment>>[]
    }

    expect(resourceTableProps.columns[3].id).toBe('labels')
    expect(resourceTableProps.columns[4].id).toBe('annotations')
    expect(resourceTableProps.columns[5].id).toBe('containers-and-images')
    expect(resourceTableProps.columns[6].id).toBe('resource-limits')
    expect(resourceTableProps.columns[7].id).toBe('created')

    const deployment = {
      metadata: {
        name: 'web',
        namespace: 'default',
        creationTimestamp: '2026-05-04T08:00:00.000Z',
        labels: {
          app: 'web',
          env: 'prod',
          team: 'platform',
        },
        annotations: {
          note: 'critical',
          owner: 'sre',
          runbook: 'wiki/web',
        },
        managedFields: [
          {
            time: '2026-05-05T06:30:00.000Z',
          },
          {
            time: '2026-05-05T09:15:00.000Z',
          },
        ],
      },
      spec: {
        replicas: 3,
        template: {
          spec: {
            containers: [
              {
                name: 'api',
                image: 'nginx:1.0',
                resources: {
                  limits: {
                    cpu: '500m',
                    memory: '256Mi',
                  },
                },
              },
              {
                name: 'sidecar',
                image: 'busybox:1.0',
                resources: {
                  limits: {
                    cpu: '250m',
                    memory: '128Mi',
                  },
                },
              },
            ],
          },
        },
      },
      status: {
        readyReplicas: 2,
        replicas: 3,
        conditions: [],
      },
    } as Deployment

    const row = {
      original: deployment,
    }

    const renderedRow = render(
      <div>
        {flexRender(resourceTableProps.columns[3].cell!, { row })}
        {flexRender(resourceTableProps.columns[4].cell!, { row })}
        {flexRender(resourceTableProps.columns[5].cell!, { row })}
        {flexRender(resourceTableProps.columns[6].cell!, { row })}
        {flexRender(resourceTableProps.columns[7].cell!, {
          row,
          getValue: () => deployment.metadata?.creationTimestamp,
        })}
      </div>
    )

    expect(
      screen.getByRole('button', { name: 'deploymentList.manageLabels' })
    ).toHaveTextContent('3')
    expect(
      screen.getByRole('button', { name: 'deploymentList.manageAnnotations' })
    ).toHaveTextContent('3')

    fireEvent.click(
      screen.getByRole('button', { name: 'deploymentList.manageLabels' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'deploymentList.manageAnnotations' })
    )

    expect(
      screen.getByText('resource-metadata-dialog-labels')
    ).toBeInTheDocument()
    expect(
      screen.getByText('resource-metadata-dialog-annotations')
    ).toBeInTheDocument()

    expect(renderedRow.container).toHaveTextContent(
      'api: nginx:1.0 | sidecar: busybox:1.0'
    )
    expect(renderedRow.container).toHaveTextContent('CPU: 0.8')
    expect(renderedRow.container).toHaveTextContent('Memory: 0.4Gi')
    expect(renderedRow.container).toHaveTextContent(
      `${formatDate(deployment.metadata!.creationTimestamp!)} (${formatRelativeTimeStrict(
        deployment.metadata!.creationTimestamp!
      )})`
    )
  })

  it('keeps deployment table columns stable when metadata dialogs open', () => {
    render(<DeploymentListPage />)

    const initialResourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Deployment>>[]
    }
    const initialColumns = initialResourceTableProps.columns

    const deployment = {
      metadata: {
        name: 'web',
        namespace: 'default',
        labels: {
          app: 'web',
        },
      },
    } as Deployment

    const row = {
      original: deployment,
    }

    render(<div>{flexRender(initialColumns[3].cell!, { row })}</div>)

    act(() => {
      screen
        .getByRole('button', { name: 'deploymentList.manageLabels' })
        .click()
    })

    const latestResourceTableProps = mockResourceTable.mock.calls.at(-1)?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Deployment>>[]
    }

    expect(latestResourceTableProps.columns).toBe(initialColumns)
  })

  it('provides row context menu actions for deployment rows', async () => {
    render(<DeploymentListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (deployment: Deployment) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const deployment = {
      metadata: {
        name: 'web',
        namespace: 'default',
      },
    } as Deployment

    const items = resourceTableProps.getRowContextMenuItems(deployment)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'open-terminal',
      'edit-image',
      'pause-orchestration',
      'rollout-restart',
      'rollback',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
      'delete-deployment',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/deployments/default/web?tab=yaml'
    )

    await act(async () => {
      await items[1].onSelect?.()
    })
    expect(mockOpenWorkloadTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: deployment,
        kind: 'Deployment',
        sourcePrefix: 'deployment',
        openSession: mockOpenSession,
      })
    )

    await act(async () => {
      await items[2].onSelect?.()
    })
    expect(screen.getByText('container-edit-dialog')).toBeInTheDocument()

    await act(async () => {
      await items[4].onSelect?.()
    })
    expect(
      screen.getByText('detail.dialogs.restartDeployment.title')
    ).toBeInTheDocument()

    await items[5].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/deployments/default/web?tab=history'
    )

    await act(async () => {
      await items[7].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-labels')
    ).toBeInTheDocument()

    await act(async () => {
      await items[8].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-annotations')
    ).toBeInTheDocument()

    await act(async () => {
      await items[9].onSelect?.()
    })
    expect(
      screen.getByText('resource-delete-confirmation-dialog')
    ).toBeInTheDocument()
  })

  it('opens restart dialog from row context menu actions', async () => {
    vi.useRealTimers()
    mockPatchResource.mockResolvedValue(undefined)

    render(<DeploymentListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (deployment: Deployment) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const deployment = {
      metadata: {
        name: 'web',
        namespace: 'default',
      },
      spec: {
        replicas: 3,
      },
    } as Deployment

    const items = resourceTableProps.getRowContextMenuItems(deployment)

    await act(async () => {
      await items[4].onSelect?.()
    })
    expect(
      screen.getByText('detail.dialogs.restartDeployment.title')
    ).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'detail.dialogs.restartDeployment.restartButton',
        })
      )
    })

    await waitFor(() => {
      expect(mockPatchResource).toHaveBeenCalledWith(
        'deployments',
        'web',
        'default',
        expect.objectContaining({
          spec: {
            template: {
              metadata: {
                annotations: {
                  'kite.kubernetes.io/restartedAt': expect.any(String),
                },
              },
            },
          },
        })
      )
    })
  })

  it('patches deployment pause and image edits from row context menu actions', async () => {
    vi.useRealTimers()
    mockPatchResource.mockResolvedValue(undefined)

    render(<DeploymentListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (deployment: Deployment) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const deployment = {
      metadata: {
        name: 'web',
        namespace: 'default',
      },
      spec: {
        paused: false,
        template: {
          spec: {
            containers: [
              {
                name: 'api',
                image: 'nginx:1.0',
              },
            ],
          },
        },
      },
    } as Deployment

    const items = resourceTableProps.getRowContextMenuItems(deployment)

    await act(async () => {
      await items[3].onSelect?.()
    })
    await waitFor(() => {
      expect(mockPatchResource).toHaveBeenCalledWith(
        'deployments',
        'web',
        'default',
        {
          spec: {
            paused: true,
          },
        }
      )
    })

    await act(async () => {
      await items[2].onSelect?.()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('save-container-edit'))
    })
    await waitFor(() => {
      expect(mockPatchResource).toHaveBeenCalledWith(
        'deployments',
        'web',
        'default',
        {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    name: 'api',
                    image: 'nginx:2.0',
                  },
                ],
              },
            },
          },
        }
      )
    })
  })

  it('shows resume orchestration for paused deployments', async () => {
    vi.useRealTimers()
    mockPatchResource.mockResolvedValue(undefined)

    render(<DeploymentListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (deployment: Deployment) => {
        key: string
        label?: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const deployment = {
      metadata: {
        name: 'web',
        namespace: 'default',
      },
      spec: {
        paused: true,
      },
    } as Deployment

    const items = resourceTableProps.getRowContextMenuItems(deployment)

    expect(items[3].key).toBe('resume-orchestration')
    expect(items[3].label).toBe('deploymentList.resumeOrchestration')

    await act(async () => {
      await items[3].onSelect?.()
    })
    await waitFor(() => {
      expect(mockPatchResource).toHaveBeenCalledWith(
        'deployments',
        'web',
        'default',
        {
          spec: {
            paused: false,
          },
        }
      )
    })
  })
})
