import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        fallbackOrOptions?: string | { defaultValue?: string; version?: string }
      ) => {
        if (typeof fallbackOrOptions === 'string') {
          return fallbackOrOptions
        }
        if (fallbackOrOptions?.defaultValue) {
          return fallbackOrOptions.defaultValue.replace(
            '{{version}}',
            fallbackOrOptions.version ?? ''
          )
        }
        return key
      },
    }),
  }
})

import { ClusterDialog } from './cluster-dialog'

beforeEach(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

describe('ClusterDialog', () => {
  it('keeps create disabled until connection test succeeds', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onTestConnection = vi
      .fn()
      .mockResolvedValue({ message: 'ok', version: 'v1.30.0' })

    render(
      <ClusterDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        onTestConnection={onTestConnection}
      />
    )

    const nameInput = screen.getByLabelText('Cluster Name *')
    const configInput = screen.getByLabelText('Kubeconfig *')
    const addButton = screen.getByRole('button', { name: 'Add Cluster' })
    const testButton = screen.getByRole('button', { name: 'Test Connection' })

    expect(addButton).toBeDisabled()
    expect(testButton).toBeDisabled()

    await user.type(nameInput, 'dev-cluster')
    await user.type(configInput, 'apiVersion: v1')

    expect(testButton).toBeEnabled()
    expect(addButton).toBeDisabled()

    await user.click(testButton)

    await waitFor(() => expect(onTestConnection).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(addButton).toBeEnabled())

    await user.type(configInput, '\nkind: Config')

    await waitFor(() => expect(addButton).toBeDisabled())
  })

  it('keeps create disabled when connection test fails', async () => {
    const user = userEvent.setup()
    const onTestConnection = vi.fn().mockRejectedValue(new Error('connection failed'))

    render(
      <ClusterDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onTestConnection={onTestConnection}
      />
    )

    await user.type(screen.getByLabelText('Cluster Name *'), 'dev-cluster')
    await user.type(screen.getByLabelText('Kubeconfig *'), 'apiVersion: v1')
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    await waitFor(() => expect(onTestConnection).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Cluster' })).toBeDisabled()
    )
  })
})
