import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { describe, expect, it, vi } from 'vitest'

import type { NodeWithMetrics } from '@/types/api'

import { NodeListPage } from './node-list-page'

const mockResourceTable = vi.fn()

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
    useNavigate: () => vi.fn(),
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

describe('NodeListPage', () => {
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
})
