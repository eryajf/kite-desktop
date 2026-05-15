import { type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Pod } from 'kubernetes-types/core/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PodListPage } from './pod-list-page'

const mockNavigate = vi.fn()
const mockResourceTable = vi.fn(({ resourceName }: { resourceName: string }) => (
  <div>{resourceName}</div>
))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
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

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/resource-table', () => ({
  ResourceTable: (props: { resourceName: string }) => mockResourceTable(props),
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

vi.mock('@/components/resource-delete-confirmation-dialog', () => ({
  ResourceDeleteConfirmationDialog: ({
    open,
    resourceName,
    resourceType,
    namespace,
  }: {
    open: boolean
    resourceName: string
    resourceType: string
    namespace?: string
  }) =>
    open ? (
      <div>
        <span>resource-delete-confirmation-dialog</span>
        <span>{`${resourceType}/${namespace}/${resourceName}`}</span>
      </div>
    ) : null,
}))

describe('PodListPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockResourceTable.mockClear()
  })

  it('provides unified row actions for pods', async () => {
    render(<PodListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (pod: Pod) => {
        key: string
        disabled?: boolean | ((item: unknown) => boolean)
        onSelect?: () => void | Promise<void>
      }[]
    }

    const pod = {
      metadata: {
        name: 'api-0',
        namespace: 'default',
      },
      status: {
        podIP: '10.42.0.18',
      },
    } as Pod

    const items = resourceTableProps.getRowContextMenuItems(pod)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'open-terminal',
      'view-logs',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
      'delete-pod',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith('/pods/default/api-0?tab=yaml')

    await items[1].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/pods/default/api-0?tab=terminal'
    )

    await items[2].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith('/pods/default/api-0?tab=logs')

    await act(async () => {
      await items[4].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-labels')
    ).toBeInTheDocument()

    await act(async () => {
      await items[5].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-annotations')
    ).toBeInTheDocument()

    await act(async () => {
      await items[6].onSelect?.()
    })
    expect(
      screen.getByText('resource-delete-confirmation-dialog')
    ).toBeInTheDocument()
    expect(screen.getByText('pods/default/api-0')).toBeInTheDocument()
  })

  it('adds metadata, image, resource limit, and full timestamp columns', () => {
    render(<PodListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ColumnDef<Pod>[]
      searchQueryFilter: (pod: Pod, query: string) => boolean
    }

    expect(resourceTableProps.columns.map((column) => column.id)).toEqual(
      expect.arrayContaining([
        'labels',
        'annotations',
        'containers-and-images',
        'resource-limits',
        'creationTimestamp',
      ])
    )

    const pod = {
      metadata: {
        name: 'api-0',
        namespace: 'default',
        labels: {
          app: 'checkout',
        },
        annotations: {
          owner: 'platform',
        },
      },
      spec: {
        containers: [
          {
            name: 'api',
            image: 'ghcr.io/acme/checkout-api:v1.2.3',
          },
        ],
      },
      status: {
        podIP: '10.42.0.18',
      },
    } as Pod

    expect(resourceTableProps.searchQueryFilter(pod, 'checkout')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(pod, 'platform')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(pod, 'checkout-api')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(pod, 'not-found')).toBe(false)
  })
})
