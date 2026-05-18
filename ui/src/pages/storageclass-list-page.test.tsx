import { type ReactNode } from 'react'
import { createColumnHelper, flexRender } from '@tanstack/react-table'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StorageClass } from 'kubernetes-types/storage/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StorageClassListPage } from './storageclass-list-page'

const mockNavigate = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockInvalidateQueries = vi.fn()
const mockSetStorageClassDefault = vi.fn()
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
  StorageClassCreateDialog: ({
    open,
    onSuccess,
  }: {
    open: boolean
    onSuccess: (storageClass: StorageClass) => void
  }) =>
    open ? (
      <div>
        <span>storageclass-create-dialog</span>
        <button
          onClick={() =>
            onSuccess({
              metadata: {
                name: 'fast-ssd',
              },
            } as StorageClass)
          }
        >
          finish-create
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/editors/storage-edit-dialogs', () => ({
  isDefaultStorageClass: (storageClass: StorageClass) =>
    storageClass.metadata?.annotations?.[
      'storageclass.kubernetes.io/is-default-class'
    ] === 'true',
  setStorageClassDefault: (...args: unknown[]) =>
    mockSetStorageClassDefault(...args),
}))

describe('StorageClassListPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockInvalidateQueries.mockReset()
    mockSetStorageClassDefault.mockReset()
    mockResourceTable.mockClear()
  })

  it('opens storage class create dialog and navigates to the created resource', async () => {
    render(<StorageClassListPage />)

    expect(screen.getByText('create-enabled')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'open-create' }))
    expect(screen.getByText('storageclass-create-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'finish-create' }))
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['storageclasses'],
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/storageclasses/fast-ssd')
    })
  })

  it('renders storage class operational columns', () => {
    render(<StorageClassListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      columns: ReturnType<typeof createColumnHelper<StorageClass>>[]
      clusterScope: boolean
    }

    expect(resourceTableProps.clusterScope).toBe(true)
    expect(resourceTableProps.columns.map((column) => column.id)).toEqual([
      'name',
      'provisioner',
      'default-class',
      'reclaim-policy',
      'binding-mode',
      'allow-expansion',
      'parameters',
      'mount-options',
      'created',
    ])

    const storageClass = {
      metadata: {
        name: 'fast-ssd',
        annotations: {
          'storageclass.kubernetes.io/is-default-class': 'true',
        },
        creationTimestamp: '2026-05-10T13:53:27.000Z',
      },
      provisioner: 'ebs.csi.aws.com',
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'WaitForFirstConsumer',
      allowVolumeExpansion: true,
      parameters: {
        type: 'gp3',
        encrypted: 'true',
      },
      mountOptions: ['discard'],
    } as StorageClass

    const row = {
      original: storageClass,
    }

    const renderedRow = render(
      <div>
        {flexRender(resourceTableProps.columns[1].cell!, {
          getValue: () => storageClass.provisioner,
        })}
        {flexRender(resourceTableProps.columns[2].cell!, { row })}
        {flexRender(resourceTableProps.columns[4].cell!, {
          getValue: () => storageClass.volumeBindingMode,
        })}
        {flexRender(resourceTableProps.columns[5].cell!, {
          getValue: () => storageClass.allowVolumeExpansion,
        })}
        {flexRender(resourceTableProps.columns[6].cell!, { row })}
        {flexRender(resourceTableProps.columns[7].cell!, { row })}
      </div>
    )

    expect(renderedRow.container).toHaveTextContent('ebs.csi.aws.com')
    expect(renderedRow.container).toHaveTextContent('common.yes')
    expect(renderedRow.container).toHaveTextContent('WaitForFirstConsumer')
    expect(screen.getByRole('button', { name: 'storageClasses.viewParameters' })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: 'storageClasses.viewMountOptions' })).toHaveTextContent('1')
  })

  it('searches storage classes by provisioner, policy, mode, and parameters', () => {
    render(<StorageClassListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      searchQueryFilter: (storageClass: StorageClass, query: string) => boolean
    }

    const storageClass = {
      metadata: {
        name: 'fast-ssd',
      },
      provisioner: 'ebs.csi.aws.com',
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'WaitForFirstConsumer',
      parameters: {
        type: 'gp3',
      },
    } as StorageClass

    expect(resourceTableProps.searchQueryFilter(storageClass, 'ebs')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(storageClass, 'delete')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(storageClass, 'consumer')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(storageClass, 'gp3')).toBe(true)
    expect(resourceTableProps.searchQueryFilter(storageClass, 'missing')).toBe(false)
  })

  it('provides unified row actions for storage classes', async () => {
    render(<StorageClassListPage />)

    const resourceTableProps = mockResourceTable.mock.calls[0]?.[0] as {
      getRowContextMenuItems: (storageClass: StorageClass) => {
        key: string
        onSelect?: () => void | Promise<void>
      }[]
    }

    const storageClass = {
      metadata: {
        name: 'fast-ssd',
      },
      provisioner: 'ebs.csi.aws.com',
    } as StorageClass

    const items = resourceTableProps.getRowContextMenuItems(storageClass)

    expect(items.map((item) => item.key)).toEqual([
      'view-yaml',
      'set-default-storage-class',
      'primary-actions-separator',
      'copy-name',
      'copy-provisioner',
      'metadata-actions-separator',
      'manage-labels',
      'manage-annotations',
    ])

    await items[0].onSelect?.()
    expect(mockNavigate).toHaveBeenCalledWith('/storageclasses/fast-ssd?tab=yaml')

    await items[1].onSelect?.()
    expect(mockSetStorageClassDefault).toHaveBeenCalledWith(storageClass, true)
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['storageclasses'],
    })

    await items[3].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('fast-ssd')

    await items[4].onSelect?.()
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith('ebs.csi.aws.com')
  })
})
