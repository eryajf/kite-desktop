import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { describe, expect, it, vi } from 'vitest'

import type { NodeWithMetrics } from '@/types/api'

import { NodeListPage } from './node-list-page'

const mockResourceTable = vi.fn()
const mockNavigate = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockMetricCell = vi.fn()

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

vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>(
      '@tanstack/react-query'
    )

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  }
})

vi.mock('@/components/resource-table', () => ({
  ResourceTable: (props: unknown) => {
    mockResourceTable(props)
    return null
  },
}))

vi.mock('@/components/metrics-cell', () => ({
  MetricCell: (props: unknown) => {
    mockMetricCell(props)
    return null
  },
}))

vi.mock('@/lib/desktop', () => ({
  copyTextToClipboard: (value: string) => mockCopyTextToClipboard(value),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('NodeListPage', () => {
  beforeEach(() => {
    mockResourceTable.mockClear()
    mockNavigate.mockClear()
    mockCopyTextToClipboard.mockClear()
    mockMetricCell.mockClear()
  })

  it('keeps status and roles columns mapped to the correct headers and values', () => {
    render(<NodeListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<NodeWithMetrics>>[]
    }

    expect(resourceTableProps.columns[1].id).toBe('status')
    expect(resourceTableProps.columns[2].id).toBe('roles')
    expect(resourceTableProps.columns[2].header).toBe('nodes.roles')
    expect(resourceTableProps.columns[1].meta).toEqual({ align: 'left' })
    expect(resourceTableProps.columns[2].meta).toEqual({ align: 'left' })

    const sampleNode = {
      metadata: {
        name: 'orbstack',
        labels: {
          'node-role.kubernetes.io/control-plane': '',
        },
      },
      spec: {},
      status: {
        conditions: [
          {
            type: 'Ready',
            status: 'True',
          },
        ],
      },
      metrics: {
        pods: 15,
        podsLimit: 110,
      },
    } as NodeWithMetrics

    const row = { original: sampleNode }

    render(
      <div>
        {flexRender(resourceTableProps.columns[1].cell!, {
          row,
          getValue: () => 'Ready',
        })}
        {flexRender(resourceTableProps.columns[2].cell!, {
          row,
          getValue: () => ['control-plane'],
        })}
      </div>
    )

    expect(screen.getByText('detail.fields.ready')).toBeInTheDocument()
    expect(screen.getByText('control-plane')).toBeInTheDocument()
  })

  it('renders cpu and memory metrics with the compact stacked layout', () => {
    render(<NodeListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<NodeWithMetrics>>[]
    }

    const sampleNode = {
      metadata: {
        name: 'orbstack',
      },
      spec: {},
      status: {},
      metrics: {
        cpuUsage: 2378,
        cpuLimit: 31850,
        memoryUsage: 50261951275,
        memoryLimit: 62331219968,
      },
    } as NodeWithMetrics

    const row = { original: sampleNode }

    render(
      <div>
        {flexRender(resourceTableProps.columns[4].cell!, { row })}
        {flexRender(resourceTableProps.columns[5].cell!, { row })}
      </div>
    )

    expect(mockMetricCell).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        metrics: sampleNode.metrics,
        type: 'cpu',
        limitLabel: 'detail.fields.allocatable',
        showPercentage: true,
        layout: 'stacked',
        cpuUnit: 'cores',
      })
    )

    expect(mockMetricCell).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        metrics: sampleNode.metrics,
        type: 'memory',
        limitLabel: 'detail.fields.allocatable',
        showPercentage: true,
        layout: 'stacked',
        compactValue: true,
      })
    )
  })

  it('keeps the shared node row action model intact', async () => {
    render(<NodeListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (node: NodeWithMetrics) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const node = {
      metadata: {
        name: 'orbstack',
      },
      spec: {},
      status: {
        addresses: [
          {
            type: 'InternalIP',
            address: '192.168.64.3',
          },
        ],
      },
    } as NodeWithMetrics

    const items = resourceTableProps.getRowContextMenuItems(node)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'primary-actions-separator',
      'copy-name',
      'copy-ip',
      'node-operations-separator',
      'open-terminal',
      'cordon',
      'drain',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith('/nodes/orbstack?tab=yaml')

    await items[2].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('orbstack')

    await items[3].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('192.168.64.3')

    await act(async () => {
      await items[5].onSelect?.()
    })
    expect(screen.getByText('nodes.terminalDialogTitle')).toBeInTheDocument()
  })
})
