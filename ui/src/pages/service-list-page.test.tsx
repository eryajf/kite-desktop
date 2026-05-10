import { type ReactNode } from 'react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { act, render, screen } from '@testing-library/react'
import type { Service } from 'kubernetes-types/core/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'

import { ServiceListPage } from './service-list-page'

const mockNavigate = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockT = (key: string) => key
const mockResourceTable = vi.fn(({ resourceName }: { resourceName: string }) => (
  <div>{resourceName}</div>
))

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

vi.mock('@/lib/desktop', () => ({
  copyTextToClipboard: (value: string) => mockCopyTextToClipboard(value),
}))

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

describe('ServiceListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T13:53:27.000Z'))
    mockNavigate.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockResourceTable.mockClear()
  })

  it('renders service metadata, selector, and relative creation time columns', () => {
    render(<ServiceListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Service>>[]
    }

    expect(resourceTableProps.columns[5].id).toBe('labels')
    expect(resourceTableProps.columns[6].id).toBe('annotations')
    expect(resourceTableProps.columns[7].id).toBe('selector')
    expect(resourceTableProps.columns[8].id).toBe('created')

    const service = {
      metadata: {
        name: 'web',
        namespace: 'default',
        creationTimestamp: '2026-05-09T15:53:27.000Z',
        labels: {
          app: 'web',
          env: 'prod',
        },
        annotations: {
          owner: 'platform',
          runbook: 'wiki/web',
        },
      },
      spec: {
        selector: {
          app: 'web',
          tier: 'frontend',
          version: 'v1',
        },
      },
    } as Service

    const row = {
      original: service,
    }

    const renderedRow = render(
      <div>
        {flexRender(resourceTableProps.columns[5].cell!, { row })}
        {flexRender(resourceTableProps.columns[6].cell!, { row })}
        {flexRender(resourceTableProps.columns[7].cell!, { row })}
        {flexRender(resourceTableProps.columns[8].cell!, {
          row,
          getValue: () => service.metadata?.creationTimestamp,
        })}
      </div>
    )

    expect(
      screen.getByRole('button', { name: 'serviceList.manageLabels' })
    ).toHaveTextContent('2')
    expect(
      screen.getByRole('button', { name: 'serviceList.manageAnnotations' })
    ).toHaveTextContent('2')
    expect(
      screen.getByRole('button', { name: 'serviceList.viewSelector' })
    ).toHaveTextContent('3')
    expect(renderedRow.container).toHaveTextContent(
      `${formatDate(service.metadata!.creationTimestamp!)} (${formatRelativeTimeStrict(
        service.metadata!.creationTimestamp!
      )})`
    )

    act(() => {
      screen
        .getByRole('button', { name: 'serviceList.manageLabels' })
        .click()
    })
    act(() => {
      screen
        .getByRole('button', { name: 'serviceList.manageAnnotations' })
        .click()
    })

    expect(
      screen.getByText('resource-metadata-dialog-labels')
    ).toBeInTheDocument()
    expect(
      screen.getByText('resource-metadata-dialog-annotations')
    ).toBeInTheDocument()
  })

  it('keeps service table columns stable when metadata dialogs open', () => {
    render(<ServiceListPage />)

    const initialResourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Service>>[]
    }
    const initialColumns = initialResourceTableProps.columns

    const service = {
      metadata: {
        name: 'web',
        namespace: 'default',
        labels: {
          app: 'web',
        },
      },
    } as Service

    const row = {
      original: service,
    }

    render(<div>{flexRender(initialColumns[5].cell!, { row })}</div>)

    act(() => {
      screen
        .getByRole('button', { name: 'serviceList.manageLabels' })
        .click()
    })

    const latestResourceTableProps = mockResourceTable.mock.calls.at(-1)?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Service>>[]
    }

    expect(latestResourceTableProps.columns).toBe(initialColumns)
  })

  it('matches service search text against metadata and selector values', () => {
    render(<ServiceListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      searchQueryFilter: (service: Service, query: string) => boolean
    }

    const service = {
      metadata: {
        name: 'web',
        namespace: 'default',
        labels: {
          team: 'platform',
        },
        annotations: {
          runbook: 'wiki/web',
        },
      },
      spec: {
        type: 'ClusterIP',
        clusterIP: '10.0.0.7',
        selector: {
          app: 'checkout',
        },
      },
    } as Service

    expect(resourceTableProps.searchQueryFilter(service, 'platform')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(service, 'runbook')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(service, 'checkout')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(service, 'missing')).toBe(false)
  })

  it('provides unified row actions for services', async () => {
    render(<ServiceListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (service: Service) => {
        key: string
        disabled?: boolean | ((item: unknown) => boolean)
        onSelect?: () => void | Promise<void>
      }[]
    }

    const service = {
      metadata: {
        name: 'web',
        namespace: 'default',
      },
      spec: {
        clusterIP: '10.0.0.7',
      },
    } as Service

    const items = resourceTableProps.getRowContextMenuItems(service)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'primary-actions-separator',
      'copy-name',
      'copy-namespace',
      'copy-cluster-ip',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith('/services/default/web?tab=yaml')

    await items[2].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('web')

    await items[3].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('default')

    await items[4].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('10.0.0.7')

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
  })
})
