import { type ReactNode } from 'react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { act, render, screen } from '@testing-library/react'
import type { Ingress } from 'kubernetes-types/networking/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'

import { IngressListPage } from './ingress-list-page'

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

describe('IngressListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T14:00:39.000Z'))
    mockNavigate.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockResourceTable.mockClear()
  })

  it('stacks ingress hosts, route summaries, and load balancer addresses with a compact more indicator', () => {
    render(<IngressListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Ingress>>[]
    }

    const ingress = {
      metadata: {
        name: 'gateway',
        namespace: 'default',
        creationTimestamp: '2026-05-09T14:00:39.000Z',
      },
      spec: {
        rules: [
          {
            host: 'app.example.com',
            http: {
              paths: [
                {
                  path: '/api',
                  backend: {
                    service: {
                      name: 'api-service',
                    },
                  },
                },
              ],
            },
          },
          {
            host: 'api.example.com',
            http: {
              paths: [
                {
                  path: '/v1',
                  backend: {
                    service: {
                      name: 'v1-service',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
      status: {
        loadBalancer: {
          ingress: [
            {
              ip: '192.0.2.10',
            },
            {
              hostname: 'lb.example.com',
            },
          ],
        },
      },
    } as Ingress

    const row = {
      original: ingress,
    }

    const renderedRow = render(
      <div>
        {flexRender(resourceTableProps.columns[2].cell!, { row })}
        {flexRender(resourceTableProps.columns[3].cell!, { row })}
        {flexRender(resourceTableProps.columns[4].cell!, { row })}
        {flexRender(resourceTableProps.columns[5].cell!, {
          getValue: () => ingress.metadata?.creationTimestamp,
        })}
      </div>
    )

    expect(renderedRow.container).toHaveTextContent('app.example.com')
    expect(renderedRow.container).toHaveTextContent(
      'app.example.com/api > api-service'
    )
    expect(renderedRow.container).toHaveTextContent('192.0.2.10')
    expect(renderedRow.container).toHaveTextContent(
      `${formatDate(ingress.metadata!.creationTimestamp!)} (${formatRelativeTimeStrict(
        ingress.metadata!.creationTimestamp!
      )})`
    )
    expect(screen.getAllByText('+ 1 common.more')).toHaveLength(3)
  })

  it('provides unified row actions for ingresses', async () => {
    render(<IngressListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (ingress: Ingress) => {
        key: string
        disabled?: boolean | ((item: unknown) => boolean)
        onSelect?: () => void | Promise<void>
      }[]
    }

    const ingress = {
      metadata: {
        name: 'gateway',
        namespace: 'default',
      },
      spec: {
        rules: [
          {
            host: 'app.example.com',
          },
        ],
      },
      status: {
        loadBalancer: {
          ingress: [
            {
              ip: '192.0.2.10',
            },
          ],
        },
      },
    } as Ingress

    const items = resourceTableProps.getRowContextMenuItems(ingress)

    expect(items.map((item) => item.key)).toEqual([
      'edit-config',
      'view-yaml',
      'danger-actions-separator',
      'delete-ingress',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/ingresses/default/gateway?tab=edit'
    )

    await items[1].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/ingresses/default/gateway?tab=yaml'
    )

    await act(async () => {
      await items[3].onSelect?.()
    })
    expect(
      screen.getByText('resource-delete-confirmation-dialog')
    ).toBeInTheDocument()
    expect(screen.getByText('ingresses/default/gateway')).toBeInTheDocument()
  })
})
