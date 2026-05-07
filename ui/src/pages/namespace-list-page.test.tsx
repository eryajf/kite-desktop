import { type ReactNode } from 'react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Namespace, ResourceQuota } from 'kubernetes-types/core/v1'
import { describe, expect, it, vi } from 'vitest'

import { NamespaceListPage } from './namespace-list-page'

const mockNavigate = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockResourceQuotas: ResourceQuota[] = [
  {
    metadata: {
      name: 'team-a-quota',
      namespace: 'team-a',
    },
    status: {
      hard: {
        'limits.cpu': '4',
        'limits.memory': '8Gi',
      },
    },
  } as ResourceQuota,
]
const mockResourceTable = vi.fn(
  ({
    onCreateClick,
    showCreateButton,
    extraToolbars,
  }: {
    onCreateClick?: () => void
    showCreateButton?: boolean
    extraToolbars?: ReactNode[]
  }) => (
    <div>
      <span>{showCreateButton ? 'create-enabled' : 'create-disabled'}</span>
      <button onClick={onCreateClick}>open-create</button>
      {extraToolbars?.map((toolbar, index) => (
        <div key={index}>{toolbar}</div>
      ))}
    </div>
  )
)

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

vi.mock('@/lib/api', () => ({
  useResources: () => ({
    data: mockResourceQuotas,
  }),
}))

vi.mock('@/lib/desktop', () => ({
  copyTextToClipboard: (value: string) => mockCopyTextToClipboard(value),
}))

vi.mock('@/components/resource-table', () => ({
  ResourceTable: (props: {
    onCreateClick?: () => void
    showCreateButton?: boolean
  }) => mockResourceTable(props),
}))

vi.mock('@/components/editors/namespace-create-dialog', () => ({
  NamespaceCreateDialog: ({
    open,
    onSuccess,
  }: {
    open: boolean
    onSuccess: (namespace: { metadata?: { name?: string } }) => void
  }) =>
    open ? (
      <div>
        <span>namespace-create-dialog</span>
        <button
          onClick={() => onSuccess({ metadata: { name: 'new-namespace' } })}
        >
          finish-create
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/editors/namespace-edit-dialog', () => ({
  NamespaceEditDialog: ({
    open,
    namespace,
    resourceQuota,
  }: {
    open: boolean
    namespace?: { metadata?: { name?: string } } | null
    resourceQuota?: {
      metadata?: { name?: string }
      status?: { hard?: Record<string, string> }
    } | null
  }) =>
    open ? (
      <div>
        <span>namespace-edit-dialog</span>
        <span>{namespace?.metadata?.name}</span>
        <span>{resourceQuota?.metadata?.name}</span>
        <span>{resourceQuota?.status?.hard?.['limits.cpu']}</span>
        <span>{resourceQuota?.status?.hard?.['limits.memory']}</span>
      </div>
    ) : null,
}))

vi.mock('@/components/editors/namespace-metadata-dialog', () => ({
  NamespaceMetadataDialog: ({
    open,
    type,
    namespace,
  }: {
    open: boolean
    type: 'labels' | 'annotations'
    namespace?: { metadata?: { name?: string } } | null
  }) =>
    open ? (
      <div>
        <span>{`namespace-metadata-dialog-${type}`}</span>
        <span>{namespace?.metadata?.name}</span>
      </div>
    ) : null,
}))

describe('NamespaceListPage', () => {
  it('shows create action and navigates after namespace creation', () => {
    render(<NamespaceListPage />)

    expect(screen.getByText('create-enabled')).toBeInTheDocument()

    fireEvent.click(screen.getByText('open-create'))
    expect(screen.getByText('namespace-create-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByText('finish-create'))
    expect(mockNavigate).toHaveBeenCalledWith('/namespaces/new-namespace')
  })

  it('renders metadata action icons, resource quota summaries, and edit action columns', () => {
    render(<NamespaceListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<Namespace>>[]
      getRowContextMenuItems: (namespace: Namespace) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    expect(resourceTableProps.columns[3].id).toBe('labels')
    expect(resourceTableProps.columns[4].id).toBe('annotations')
    expect(resourceTableProps.columns[5].id).toBe('cpu-limit')
    expect(resourceTableProps.columns[6].id).toBe('memory-limit')
    expect(resourceTableProps.columns[1].meta).toEqual({ align: 'left' })
    expect(resourceTableProps.columns[2].meta).toBeUndefined()

    const namespace = {
      metadata: {
        name: 'team-a',
        labels: {
          env: 'prod',
          owner: 'platform',
          tier: 'backend',
        },
        annotations: {
          note: 'critical',
          contact: 'oncall',
          runbook: 'wiki/team-a',
        },
      },
      status: {
        phase: 'Active',
      },
    } as Namespace

    const items = resourceTableProps.getRowContextMenuItems(namespace)

    const row = {
      original: namespace,
    }

    render(
      <div>
        {flexRender(resourceTableProps.columns[3].cell!, { row })}
        {flexRender(resourceTableProps.columns[4].cell!, { row })}
      </div>
    )

    expect(
      screen.getByRole('button', { name: 'namespaceList.manageLabels' })
    ).toHaveTextContent('3')
    expect(
      screen.getByRole('button', { name: 'namespaceList.manageAnnotations' })
    ).toHaveTextContent('3')

    fireEvent.click(
      screen.getByRole('button', { name: 'namespaceList.manageLabels' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'namespaceList.manageAnnotations' })
    )

    expect(
      screen.getByText('namespace-metadata-dialog-labels')
    ).toBeInTheDocument()
    expect(
      screen.getByText('namespace-metadata-dialog-annotations')
    ).toBeInTheDocument()

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'primary-actions-separator',
      'copy-name',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
      'namespace-operations-separator',
      'edit-namespace',
    ])
  })

  it('opens namespace row actions from the shared menu model', async () => {
    render(<NamespaceListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (namespace: Namespace) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const namespace = {
      metadata: {
        name: 'team-a',
      },
    } as Namespace

    const items = resourceTableProps.getRowContextMenuItems(namespace)

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith('/namespaces/team-a?tab=yaml')

    await items[2].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('team-a')

    await act(async () => {
      await items[4].onSelect?.()
    })
    expect(
      screen.getByText('namespace-metadata-dialog-labels')
    ).toBeInTheDocument()

    await act(async () => {
      await items[5].onSelect?.()
    })
    expect(
      screen.getByText('namespace-metadata-dialog-annotations')
    ).toBeInTheDocument()

    await act(async () => {
      await items[7].onSelect?.()
    })
    expect(screen.getByText('namespace-edit-dialog')).toBeInTheDocument()
    expect(screen.getAllByText('team-a')[0]).toBeInTheDocument()
    expect(screen.getByText('team-a-quota')).toBeInTheDocument()
    expect(items[7]).toMatchObject({
      key: 'edit-namespace',
      label: 'namespaceList.editQuota',
    })
  })
})
