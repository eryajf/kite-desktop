import { type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import type { Secret } from 'kubernetes-types/core/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SecretListPage } from './secret-list-page'

const mockNavigate = vi.fn()
const mockResourceTable = vi.fn(
  ({ resourceName }: { resourceName: string }) => <div>{resourceName}</div>
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
  }: {
    open: boolean
    resourceName: string
    resourceType: string
  }) =>
    open ? (
      <div>
        <span>resource-delete-confirmation-dialog</span>
        <span>{resourceName}</span>
        <span>{resourceType}</span>
      </div>
    ) : null,
}))

describe('SecretListPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockResourceTable.mockClear()
  })

  it('provides focused row actions for secrets', async () => {
    render(<SecretListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: { header?: string }[]
      getRowContextMenuItems: (secret: Secret) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    expect(resourceTableProps.columns.map((column) => column.header)).toEqual([
      'common.name',
      'common.type',
      'detail.fields.labels',
      'detail.fields.annotations',
      'common.created',
    ])

    const secret = {
      metadata: {
        name: 'app-secret',
        namespace: 'default',
      },
    } as Secret

    const items = resourceTableProps.getRowContextMenuItems(secret)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'edit-secret',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
      'danger-actions-separator',
      'delete-secret',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/secrets/default/app-secret?tab=yaml'
    )

    await items[1].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith('/secrets/default/app-secret')

    await act(async () => {
      await items[3].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-labels')
    ).toBeInTheDocument()

    await act(async () => {
      await items[4].onSelect?.()
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
    expect(screen.getByText('secrets')).toBeInTheDocument()
  })
})
