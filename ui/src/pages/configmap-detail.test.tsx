import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ConfigMap } from 'kubernetes-types/core/v1'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigMapDetail } from './configmap-detail'

const mockUseResource = vi.fn()
const mockUpdateResource = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockT = (key: string) => key

const configMap: ConfigMap = {
  metadata: {
    name: 'app-config',
    namespace: 'default',
    uid: 'uid-1',
    resourceVersion: '42',
    creationTimestamp: '2026-05-09T13:52:32.000Z',
    labels: {
      app: 'demo',
    },
    annotations: {
      owner: 'platform',
    },
  },
  data: {
    'app.yaml': 'server:\n  port: 8080',
    LOG_LEVEL: 'info',
  },
}

function renderConfigMapDetail() {
  return render(
    <MemoryRouter>
      <ConfigMapDetail namespace="default" name="app-config" />
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

vi.mock('@/components/describe-dialog', () => ({
  DescribeDialog: () => <button>describe</button>,
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

describe('ConfigMapDetail', () => {
  beforeEach(() => {
    mockUseResource.mockReset()
    mockUpdateResource.mockReset()
    mockCopyTextToClipboard.mockReset()
    mockUpdateResource.mockResolvedValue(undefined)
    mockUseResource.mockReturnValue({
      data: configMap,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('shows ConfigMap metadata and data in the overview without a data tab', () => {
    renderConfigMapDetail()

    expect(
      screen.getByText('detail.sections.configMapInformation')
    ).toBeInTheDocument()
    expect(screen.getByText('uid-1')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('app: demo')).toBeInTheDocument()
    expect(screen.getByText('owner: platform')).toBeInTheDocument()
    expect(screen.getByText('app.yaml')).toBeInTheDocument()
    expect(screen.getByText(/server:/)).toBeInTheDocument()
    expect(screen.queryByText('data')).not.toBeInTheDocument()
  })

  it('saves ConfigMap data through the form editor', async () => {
    renderConfigMapDetail()

    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))

    const dialog = screen.getByRole('dialog')
    const logLevelInput = within(dialog).getByDisplayValue('LOG_LEVEL')
    fireEvent.change(logLevelInput, { target: { value: 'MODE' } })

    const infoValue = within(dialog).getByDisplayValue('info')
    fireEvent.change(infoValue, { target: { value: 'production' } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    expect(mockUpdateResource).not.toHaveBeenCalled()
    expect(
      screen.getByText('configMaps.confirmSaveDataTitle')
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'configMaps.confirmSaveData' })
    )

    expect(mockUpdateResource).toHaveBeenCalledWith(
      'configmaps',
      'app-config',
      'default',
      expect.objectContaining({
        data: {
          'app.yaml': 'server:\n  port: 8080',
          MODE: 'production',
        },
      })
    )
  })
})
