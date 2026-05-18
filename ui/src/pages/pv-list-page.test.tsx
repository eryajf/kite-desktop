import { type ReactNode } from 'react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { PersistentVolume } from 'kubernetes-types/core/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDate, formatRelativeTimeStrict } from '@/lib/utils'

import { PVListPage } from './pv-list-page'

const mockNavigate = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockInvalidateQueries = vi.fn()
const mockResourceTable = vi.fn(
  ({
    onCreateClick,
    resourceName,
    showCreateButton,
  }: {
    onCreateClick?: () => void
    resourceName: string
    showCreateButton?: boolean
  }) => (
    <div>
      <span>{resourceName}</span>
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
  ResourceMetadataDialog: () => null,
}))

vi.mock('@/components/editors/storage-create-dialogs', () => ({
  PVCreateDialog: ({
    open,
    onSuccess,
  }: {
    open: boolean
    onSuccess: (pv: PersistentVolume) => void
  }) =>
    open ? (
      <div>
        <span>pv-create-dialog</span>
        <button
          onClick={() =>
            onSuccess({
              metadata: {
                name: 'pv-data-web-0',
              },
            } as PersistentVolume)
          }
        >
          finish-create
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/editors/storage-edit-dialogs', () => ({
  PVReclaimPolicyDialog: ({ open }: { open: boolean }) =>
    open ? <div>pv-reclaim-policy-dialog</div> : null,
}))

describe('PVListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T13:53:27.000Z'))
    mockNavigate.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockInvalidateQueries.mockReset()
    mockResourceTable.mockClear()
  })

  it('opens pv create dialog and navigates to the created resource', async () => {
    render(<PVListPage />)

    expect(screen.getByText('create-enabled')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'open-create' }))
    expect(screen.getByText('pv-create-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'finish-create' }))
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['persistentvolumes'],
    })
    await Promise.resolve()
    expect(mockNavigate).toHaveBeenCalledWith('/persistentvolumes/pv-data-web-0')
  })

  it('renders pv creation time with relative age', () => {
    render(<PVListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<PersistentVolume>>[]
    }
    const createdAt = '2026-05-09T13:53:27.000Z'
    const createdColumn = resourceTableProps.columns.at(-1)

    const renderedCell = render(
      <div>
        {flexRender(createdColumn!.cell!, {
          getValue: () => createdAt,
        })}
      </div>
    )

    expect(renderedCell.container).toHaveTextContent(
      `${formatDate(createdAt)} (${formatRelativeTimeStrict(createdAt)})`
    )
  })

  it('provides unified row actions for pv resources', async () => {
    render(<PVListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (pv: PersistentVolume) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const pv = {
      metadata: {
        name: 'pv-data-web-0',
      },
      spec: {
        storageClassName: 'fast-ssd',
        claimRef: {
          namespace: 'default',
          name: 'data-web-0',
        },
      },
    } as PersistentVolume

    const items = resourceTableProps.getRowContextMenuItems(pv)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'edit-reclaim-policy',
      'primary-actions-separator',
      'copy-name',
      'copy-storage-class',
      'copy-claim',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/persistentvolumes/pv-data-web-0?tab=yaml'
    )

    await act(async () => {
      await items[1].onSelect?.()
    })
    expect(screen.getByText('pv-reclaim-policy-dialog')).toBeInTheDocument()

    await items[3].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('pv-data-web-0')

    await items[4].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('fast-ssd')

    await items[5].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('default/data-web-0')
  })
})
