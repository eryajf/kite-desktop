import '@/i18n'

import { createColumnHelper } from '@tanstack/react-table'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { Deployment } from 'kubernetes-types/apps/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResourceTable } from './resource-table'

const deleteResourceMock = vi.fn()

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')

  return {
    ...actual,
    deleteResource: (...args: unknown[]) => deleteResourceMock(...args),
    useResources: () => ({
      isLoading: false,
      data: [
        {
          metadata: {
            name: 'demo',
            namespace: 'default',
            uid: 'deploy-1',
          },
        },
      ],
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useResourcesWatch: () => ({
      data: undefined,
      isLoading: false,
      error: null,
      isConnected: false,
      refetch: vi.fn(),
    }),
  }
})

describe('ResourceTable batch delete confirmation', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        ResizeObserver: new (callback: ResizeObserverCallback) => ResizeObserver
      }
    ).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as new (callback: ResizeObserverCallback) => ResizeObserver
    localStorage.setItem('current-cluster', 'test-cluster')
    deleteResourceMock.mockReset()
    deleteResourceMock.mockResolvedValue(undefined)
  })

  it('requires the global confirmation keyword before deleting selected rows', async () => {
    void i18n.changeLanguage('zh')

    const columnHelper = createColumnHelper<Deployment>()

    render(
      <ResourceTable
        resourceName="Deployments"
        resourceType="deployments"
        clusterScope={true}
        columns={[
          columnHelper.accessor('metadata.name', {
            header: 'Name',
            cell: ({ row }) => row.original.metadata?.name,
          }),
        ]}
      />
    )

    fireEvent.click(screen.getByLabelText('选择行'))
    fireEvent.click(screen.getByRole('button', { name: '删除 (1)' }))

    const confirmButton = screen.getByRole('button', { name: '删除' })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/输入/), {
      target: { value: 'demo' },
    })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/输入/), {
      target: { value: '确认删除' },
    })
    expect(confirmButton).not.toBeDisabled()

    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(deleteResourceMock).toHaveBeenCalledWith(
        'deployments',
        'demo',
        undefined
      )
    })
  })
})
