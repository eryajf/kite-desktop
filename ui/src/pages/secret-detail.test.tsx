import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Secret } from 'kubernetes-types/core/v1'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SecretDetail } from './secret-detail'

const mockUseResource = vi.fn()
const mockUpdateResource = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockT = (key: string) => key

const secret: Secret = {
  metadata: {
    name: 'app-secret',
    namespace: 'default',
    uid: 'uid-secret',
    resourceVersion: '7',
    creationTimestamp: '2026-05-09T13:52:32.000Z',
    labels: {
      app: 'demo',
    },
    annotations: {
      owner: 'platform',
    },
  },
  type: 'Opaque',
  data: {
    PASSWORD: btoa('old-password'),
    TOKEN: btoa('abc123'),
  },
}

function renderSecretDetail() {
  return render(
    <MemoryRouter>
      <SecretDetail namespace="default" name="app-secret" />
    </MemoryRouter>
  )
}

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: mockT,
    }),
  }
})

vi.mock('@/lib/api', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
  updateResource: (...args: unknown[]) => mockUpdateResource(...args),
}))

vi.mock('@/lib/desktop', () => ({
  copyTextToClipboard: (value: string) => mockCopyTextToClipboard(value),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/ui/responsive-tabs', () => ({
  ResponsiveTabs: ({
    tabs,
  }: {
    tabs: { value: string; label: string; content: React.ReactNode }[]
  }) => (
    <div>
      <div>
        {tabs.map((tab) => (
          <span key={tab.value}>{tab.value}</span>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.value}>{tab.content}</div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/refresh-button', () => ({
  RefreshButton: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}))

vi.mock('@/components/yaml-editor', () => ({
  YamlEditor: () => <div>yaml-editor</div>,
}))

vi.mock('@/components/related-resource-table', () => ({
  RelatedResourcesTable: () => <div>related-resources</div>,
}))

vi.mock('@/components/event-table', () => ({
  EventTable: () => <div>events</div>,
}))

vi.mock('@/components/resource-history-table', () => ({
  ResourceHistoryTable: () => <div>history</div>,
}))

vi.mock('@/components/resource-delete-confirmation-dialog', () => ({
  ResourceDeleteConfirmationDialog: () => null,
}))

describe('SecretDetail', () => {
  beforeEach(() => {
    mockUseResource.mockReset()
    mockUpdateResource.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockUpdateResource.mockResolvedValue(undefined)
    mockUseResource.mockReturnValue({
      data: secret,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('shows Secret metadata and data in the overview without a data tab', () => {
    renderSecretDetail()

    expect(
      screen.getByText('detail.sections.secretInformation')
    ).toBeInTheDocument()
    expect(screen.getByText('uid-secret')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('app: demo')).toBeInTheDocument()
    expect(screen.getByText('owner: platform')).toBeInTheDocument()
    expect(screen.getByText('PASSWORD')).toBeInTheDocument()
    expect(screen.getByText('TOKEN')).toBeInTheDocument()
    expect(screen.queryByText('data')).not.toBeInTheDocument()
  })

  it('reveals all secret values from the data toolbar', () => {
    renderSecretDetail()

    const password = screen.getByText('old-password')
    expect(password).toHaveClass('blur-sm')

    fireEvent.click(
      screen.getByRole('button', { name: 'keyValueDataViewer.revealAll' })
    )

    expect(password).not.toHaveClass('blur-sm')
    expect(
      screen.getByRole('button', { name: 'keyValueDataViewer.hideAll' })
    ).toBeInTheDocument()
  })

  it('saves decoded Secret data through the form editor after confirmation', () => {
    renderSecretDetail()

    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))

    const dialog = screen.getByRole('dialog')
    const passwordValue = within(dialog).getByDisplayValue('old-password')
    fireEvent.change(passwordValue, { target: { value: 'new-password' } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    expect(mockUpdateResource).not.toHaveBeenCalled()
    expect(screen.getByText('secrets.confirmSaveDataTitle')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'secrets.confirmSaveData' })
    )

    expect(mockUpdateResource).toHaveBeenCalledWith(
      'secrets',
      'app-secret',
      'default',
      expect.objectContaining({
        data: {
          PASSWORD: btoa('new-password'),
          TOKEN: btoa('abc123'),
        },
        stringData: undefined,
      })
    )
  })
})
