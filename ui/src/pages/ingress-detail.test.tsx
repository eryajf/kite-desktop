import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Ingress } from 'kubernetes-types/networking/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IngressDetail } from './ingress-detail'

const mockUseResource = vi.fn()
const mockUseResources = vi.fn()
const mockUpdateResource = vi.fn()
const mockResourceHistoryTable = vi.fn()
const mockT = (key: string) => key

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
  useResources: (...args: unknown[]) => mockUseResources(...args),
  updateResource: (...args: unknown[]) => mockUpdateResource(...args),
}))

vi.mock('@/components/ui/responsive-tabs', () => ({
  ResponsiveTabs: ({
    tabs,
  }: {
    tabs: { value: string; label: string; content: React.ReactNode }[]
  }) => <div>{tabs.map((tab) => <div key={tab.value}>{tab.content}</div>)}</div>,
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
  ResourceHistoryTable: (props: unknown) => {
    mockResourceHistoryTable(props)
    return <div>history</div>
  },
}))

vi.mock('@/components/resource-delete-confirmation-dialog', () => ({
  ResourceDeleteConfirmationDialog: () => null,
}))

describe('IngressDetail', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    mockUseResource.mockReset()
    mockUseResources.mockReset()
    mockResourceHistoryTable.mockReset()
    mockUseResources.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUpdateResource.mockReset()
    mockUpdateResource.mockResolvedValue(undefined)
  })

  it('renders ingress routes grouped by host', () => {
    const ingress = {
      metadata: {
        name: 'gateway',
        namespace: 'default',
        creationTimestamp: '2026-05-10T13:53:27.000Z',
      },
      spec: {
        ingressClassName: 'nginx',
        defaultBackend: {
          service: {
            name: 'fallback',
            port: {
              number: 80,
            },
          },
        },
        tls: [
          {
            hosts: ['app.example.com'],
            secretName: 'app-tls',
          },
        ],
        rules: [
          {
            host: 'app.example.com',
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: 'web',
                      port: {
                        number: 80,
                      },
                    },
                  },
                },
                {
                  path: '/api',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: 'api',
                      port: {
                        name: 'http',
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            host: 'api.example.com',
            http: {
              paths: [
                {
                  path: '/v1',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: 'api-v1',
                      port: {
                        number: 8080,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
      status: {
        loadBalancer: {
          ingress: [
            {
              ip: '192.0.2.10',
            },
          ],
        },
      },
    } as Ingress

    mockUseResource.mockReturnValue({
      data: ingress,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<IngressDetail namespace="default" name="gateway" />)

    expect(screen.getAllByText('app.example.com')).toHaveLength(1)
    expect(screen.getAllByText('api.example.com')).toHaveLength(1)
    expect(screen.getAllByText('/')).toHaveLength(2)
    expect(screen.getByText('/api')).toBeInTheDocument()
    expect(screen.getByText('/v1')).toBeInTheDocument()
    expect(screen.getByText('web:80')).toBeInTheDocument()
    expect(screen.getByText('api:http')).toBeInTheDocument()
    expect(screen.getByText('api-v1:8080')).toBeInTheDocument()
    expect(screen.getAllByText('app-tls')).toHaveLength(1)
    expect(screen.getAllByText('fallback:80')).toHaveLength(2)
    expect(mockResourceHistoryTable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'ingresses',
        name: 'gateway',
        namespace: 'default',
        currentResource: ingress,
      })
    )
  })

  it('edits ingress routes, tls, labels, and annotations by host group', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    const ingress = {
      metadata: {
        name: 'gateway',
        namespace: 'default',
        creationTimestamp: '2026-05-10T13:53:27.000Z',
        labels: {
          app: 'gateway',
        },
        annotations: {
          owner: 'platform',
        },
      },
      spec: {
        ingressClassName: 'nginx',
        tls: [
          {
            hosts: ['app.example.com'],
            secretName: 'app-tls',
          },
        ],
        rules: [
          {
            host: 'app.example.com',
            http: {
              paths: [
                {
                  path: '/api',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: 'api',
                      port: {
                        number: 80,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    } as Ingress

    mockUseResource.mockReturnValue({
      data: ingress,
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    })

    mockUseResources.mockImplementation((resource: string) => {
      if (resource === 'services') {
        return {
          data: [
            {
              metadata: { name: 'api' },
              spec: { ports: [{ port: 80 }, { name: 'http', port: 8080 }] },
            },
            {
              metadata: { name: 'web' },
              spec: { ports: [{ port: 8080 }] },
            },
          ],
          isLoading: false,
        }
      }
      if (resource === 'secrets') {
        return {
          data: [{ metadata: { name: 'app-tls' } }],
          isLoading: false,
        }
      }
      return {
        data: [],
        isLoading: false,
      }
    })

    render(<IngressDetail namespace="default" name="gateway" />)

    await user.click(
      screen.getByRole('button', { name: 'ingresses.editConfig' })
    )

    const editDialog = screen.getByRole('dialog')
    const editForm = within(editDialog).getByTestId('ingress-edit-form')
    expect(within(editDialog).getByText('ingresses.rulesTab')).toBeInTheDocument()
    expect(within(editDialog).getByText('ingresses.certificatesTab')).toBeInTheDocument()
    expect(within(editDialog).getByText('ingresses.metadataSettings')).toBeInTheDocument()
    expect(within(editForm).getAllByDisplayValue('app.example.com').length).toBeGreaterThan(0)
    expect(within(editForm).getByDisplayValue('/api')).toBeInTheDocument()
    expect(within(editForm).getByDisplayValue('api')).toBeInTheDocument()
    expect(mockUseResources).toHaveBeenCalledWith('services', 'default')
    expect(mockUseResources).toHaveBeenCalledWith('secrets', 'default')
    expect(mockUseResources).toHaveBeenCalledWith('ingressclasses', undefined)

    await user.click(
      within(editForm).getByRole('button', { name: 'ingresses.addRoute' })
    )
    const routePathInputs = within(editForm).getAllByLabelText('ingresses.path')
    await user.clear(routePathInputs[0])
    await user.type(routePathInputs[0], '/web')
    const serviceInputs = within(editForm).getAllByLabelText('ingresses.serviceName')
    fireEvent.change(serviceInputs[0], { target: { value: 'web' } })
    const servicePortInputs = within(editForm).getAllByLabelText('ingresses.servicePort')
    fireEvent.change(servicePortInputs[0], { target: { value: '8080' } })

    await user.click(
      within(editForm).getByRole('button', { name: 'ingresses.addHost' })
    )
    const hostInputs = within(editForm).getAllByLabelText('ingresses.host')
    await user.type(hostInputs[0], 'admin.example.com')

    await user.click(within(editForm).getByRole('tab', { name: 'ingresses.certificatesTab' }))
    expect(within(editForm).getByDisplayValue('app-tls')).toBeInTheDocument()

    await user.click(within(editForm).getByRole('tab', { name: 'ingresses.metadataSettings' }))
    expect(within(editForm).getByDisplayValue('app')).toBeInTheDocument()
    expect(within(editForm).getByDisplayValue('gateway')).toBeInTheDocument()
    expect(within(editForm).getByDisplayValue('owner')).toBeInTheDocument()
    expect(within(editForm).getByDisplayValue('platform')).toBeInTheDocument()
    await user.click(
      within(editForm).getByRole('button', { name: 'ingresses.addLabel' })
    )
    const labelKeyInputs = within(editForm).getAllByLabelText('ingresses.labelKey')
    await user.type(labelKeyInputs[0], 'tier')
    const labelValueInputs = within(editForm).getAllByLabelText('ingresses.labelValue')
    await user.type(labelValueInputs[0], 'edge')

    await user.click(
      within(editForm).getByRole('button', { name: 'ingresses.saveConfig' })
    )
    expect(mockUpdateResource).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'ingresses.confirmSaveConfig' })
    )

    expect(mockUpdateResource).toHaveBeenCalledWith(
      'ingresses',
      'gateway',
      'default',
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: {
            app: 'gateway',
            tier: 'edge',
          },
          annotations: {
            owner: 'platform',
          },
        }),
        spec: expect.objectContaining({
          tls: [
            {
              hosts: ['app.example.com'],
              secretName: 'app-tls',
            },
          ],
          rules: [
            expect.objectContaining({
              host: 'admin.example.com',
            }),
            expect.objectContaining({
              host: 'app.example.com',
              http: {
                paths: [
                  expect.objectContaining({
                    path: '/web',
                    pathType: 'Prefix',
                    backend: {
                      service: {
                        name: 'web',
                        port: {
                          number: 8080,
                        },
                      },
                    },
                  }),
                  expect.objectContaining({
                    path: '/api',
                    pathType: 'Prefix',
                    backend: {
                      service: {
                        name: 'api',
                        port: {
                          number: 80,
                        },
                      },
                    },
                  }),
                ],
              },
            }),
          ],
        }),
      })
    )
    expect(refetch).toHaveBeenCalled()
  })
})
