import { type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StatefulSet } from 'kubernetes-types/apps/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StatefulSetListPage } from './statefulset-list-page'

const mockNavigate = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockInvalidateQueries = vi.fn()
const mockPatchResource = vi.fn()
const mockOpenSession = vi.fn()
const mockOpenWorkloadTerminal = vi.fn()
const mockT = (key: string) => key
const mockResourceTable = vi.fn(() => <div>statefulset-table</div>)

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
  ResourceTable: (props: unknown) => mockResourceTable(props),
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
    workload,
    onSaveWorkload,
  }: {
    open: boolean
    workload?: { metadata?: { name?: string } }
    onSaveWorkload?: (statefulSet: StatefulSet) => void | Promise<void>
  }) =>
    open ? (
      <div>
        <span>container-edit-dialog</span>
        <span>{workload?.metadata?.name}</span>
        <button
          onClick={() =>
            onSaveWorkload?.({
              metadata: workload?.metadata,
              spec: {
                template: {
                  spec: {
                    containers: [
                      {
                        name: 'mysql',
                        image: 'mysql:8.4',
                      },
                    ],
                  },
                },
              },
            } as StatefulSet)
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

describe('StatefulSetListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T10:00:00.000Z'))
    mockNavigate.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    mockInvalidateQueries.mockReset()
    mockPatchResource.mockReset()
    mockOpenSession.mockReset()
    mockOpenWorkloadTerminal.mockReset()
    mockResourceTable.mockClear()
  })

  it('provides the requested row action sequence for statefulset rows', async () => {
    render(<StatefulSetListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (statefulSet: StatefulSet) => {
        key: string
        label?: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const statefulSet = {
      metadata: {
        name: 'mysql',
        namespace: 'default',
      },
      spec: {
        paused: false,
        template: {
          spec: {
            containers: [
              {
                name: 'mysql',
                image: 'mysql:8.0',
              },
            ],
          },
        },
      },
    } as StatefulSet

    const items = resourceTableProps.getRowContextMenuItems(statefulSet)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'open-terminal',
      'edit-image',
      'rollout-restart',
      'rollback',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
      'delete-statefulset',
    ])
    expect(items[4].label).toBe('deploymentList.rollback')

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/statefulsets/default/mysql?tab=yaml'
    )

    await act(async () => {
      await items[1].onSelect?.()
    })
    expect(mockOpenWorkloadTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: statefulSet,
        kind: 'StatefulSet',
        sourcePrefix: 'statefulset',
        openSession: mockOpenSession,
      })
    )

    await act(async () => {
      await items[2].onSelect?.()
    })
    expect(screen.getByText('container-edit-dialog')).toBeInTheDocument()

    await act(async () => {
      await items[6].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-labels')
    ).toBeInTheDocument()

    await act(async () => {
      await items[7].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-annotations')
    ).toBeInTheDocument()

    await act(async () => {
      await items[8].onSelect?.()
    })
    expect(
      screen.getByText('resource-delete-confirmation-dialog')
    ).toBeInTheDocument()
  })

  it('patches statefulset image edits from row actions', async () => {
    vi.useRealTimers()
    mockPatchResource.mockResolvedValue(undefined)

    render(<StatefulSetListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (statefulSet: StatefulSet) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const statefulSet = {
      metadata: {
        name: 'mysql',
        namespace: 'default',
      },
      spec: {
        paused: false,
        template: {
          spec: {
            containers: [
              {
                name: 'mysql',
                image: 'mysql:8.0',
              },
            ],
          },
        },
      },
    } as StatefulSet

    const items = resourceTableProps.getRowContextMenuItems(statefulSet)

    await act(async () => {
      await items[2].onSelect?.()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('save-container-edit'))
    })
    await waitFor(() => {
      expect(mockPatchResource).toHaveBeenCalledWith(
        'statefulsets',
        'mysql',
        'default',
        {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    name: 'mysql',
                    image: 'mysql:8.4',
                  },
                ],
              },
            },
          },
        }
      )
    })
  })

})
