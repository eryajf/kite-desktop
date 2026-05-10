import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateClusterQueries,
  testClusterConnection,
  toastSuccess,
  useClusterList,
  useMutation,
} = vi.hoisted(() => ({
  invalidateClusterQueries: vi.fn(),
  testClusterConnection: vi.fn(),
  toastSuccess: vi.fn(),
  useClusterList: vi.fn(),
  useMutation: vi.fn(),
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        fallbackOrOptions?: string | { defaultValue?: string }
      ) => {
        if (typeof fallbackOrOptions === 'string') {
          return fallbackOrOptions
        }
        return fallbackOrOptions?.defaultValue ?? key
      },
    }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useMutation,
  useQueryClient: () => ({}),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: toastSuccess,
  },
}))

vi.mock('@/lib/api', () => ({
  createCluster: vi.fn(),
  deleteCluster: vi.fn(),
  testClusterConnection,
  updateCluster: vi.fn(),
  useClusterList,
}))

vi.mock('@/lib/analytics', () => ({
  trackDesktopEvent: vi.fn(),
}))

vi.mock('@/lib/cluster-query', () => ({
  invalidateClusterQueries,
}))

vi.mock('./cluster-dialog', () => ({
  ClusterDialog: () => null,
}))

vi.mock('@/components/delete-confirmation-dialog', () => ({
  DeleteConfirmationDialog: () => null,
}))

vi.mock('../action-table', () => ({
  ActionTable: ({
    columns,
    data,
  }: {
    columns: Array<{
      id?: string
      header?: React.ReactNode
      cell?: (context: { row: { original: unknown } }) => React.ReactNode
    }>
    data: unknown[]
  }) => (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.id}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map((column) => (
              <td key={column.id}>
                {column.cell?.({ row: { original: item } })}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}))

import { ClusterManagement } from './cluster-management'

describe('ClusterManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useClusterList.mockReturnValue({
      data: [
        {
          id: 1,
          name: 'healthy',
          version: 'v1.31.0',
          enabled: true,
          inCluster: false,
          isDefault: false,
        },
        {
          id: 2,
          name: 'broken',
          error: 'Cluster client build timed out.',
          enabled: true,
          inCluster: false,
          isDefault: false,
        },
      ],
      error: null,
      isLoading: false,
    })
    useMutation.mockReturnValue({ mutate: vi.fn(), isPending: false })
    testClusterConnection.mockResolvedValue({ message: 'ok', version: 'v1.31.0' })
  })

  it('renders a connection status column with row test buttons', () => {
    render(<ClusterManagement />)

    expect(screen.getByRole('columnheader', { name: 'Connection' })).toBeInTheDocument()
    expect(screen.getByText('Reachable')).toBeInTheDocument()
    expect(screen.getByText('Unreachable')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Test Connection' })
    ).toHaveLength(2)
  })

  it('tests the selected cluster and refreshes cluster queries', async () => {
    const user = userEvent.setup()

    render(<ClusterManagement />)

    await user.click(screen.getAllByRole('button', { name: 'Test Connection' })[1])

    await waitFor(() =>
      expect(testClusterConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 2,
          name: 'broken',
        })
      )
    )
    await waitFor(() => expect(invalidateClusterQueries).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Cluster connection is reachable.')
  })
})
