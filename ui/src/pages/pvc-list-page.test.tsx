import { type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import type { PersistentVolumeClaim } from 'kubernetes-types/core/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PVCListPage } from './pvc-list-page'

const mockNavigate = vi.fn()
const mockCopyTextToClipboard = vi.fn()
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

describe('PVCListPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockResourceTable.mockClear()
  })

  it('provides unified row actions for pvc resources', async () => {
    render(<PVCListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (pvc: PersistentVolumeClaim) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const pvc = {
      metadata: {
        name: 'data-web-0',
        namespace: 'default',
      },
    } as PersistentVolumeClaim

    const items = resourceTableProps.getRowContextMenuItems(pvc)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'primary-actions-separator',
      'copy-name',
      'copy-namespace',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/persistentvolumeclaims/default/data-web-0?tab=yaml'
    )

    await items[2].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('data-web-0')

    await items[3].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('default')

    await act(async () => {
      await items[5].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-labels')
    ).toBeInTheDocument()

    await act(async () => {
      await items[6].onSelect?.()
    })
    expect(
      screen.getByText('resource-metadata-dialog-annotations')
    ).toBeInTheDocument()
  })
})
