import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Ingress } from 'kubernetes-types/networking/v1'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IngressDetail } from './ingress-detail'

const mockUseResource = vi.fn()
const mockUseResources = vi.fn()
const mockUpdateResource = vi.fn()
const mockResourceHistoryTable = vi.fn()
const mockOpenURL = vi.fn()
const mockT = (key: string) => key

function renderIngressDetail() {
  return render(
    <MemoryRouter>
      <IngressDetail namespace="default" name="gateway" />
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
  useResources: (...args: unknown[]) => mockUseResources(...args),
  updateResource: (...args: unknown[]) => mockUpdateResource(...args),
}))

vi.mock('@/lib/desktop', () => ({
  openURL: (url: string) => mockOpenURL(url),
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
    mockOpenURL.mockReset()
    mockOpenURL.mockResolvedValue(undefined)
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
    mockUseResources.mockImplementation((resource: string) => {
      if (resource === 'services') {
        return {
          data: [
            { metadata: { name: 'web' } },
            { metadata: { name: 'api' } },
            { metadata: { name: 'api-v1' } },
          ],
          isLoading: false,
        }
      }

      return {
        data: [],
        isLoading: false,
      }
    })

    renderIngressDetail()

    expect(screen.getAllByText('app.example.com')).toHaveLength(1)
    expect(screen.getAllByText('api.example.com')).toHaveLength(1)
    expect(screen.getAllByText('/')).toHaveLength(2)
    expect(screen.getByText('/api')).toBeInTheDocument()
    expect(screen.getByText('/v1')).toBeInTheDocument()
    expect(
      screen.getAllByRole('columnheader', { name: 'ingresses.serviceName' })
        .length
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('columnheader', { name: 'ingresses.servicePort' })
        .length
    ).toBeGreaterThan(0)
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByText('api')).toBeInTheDocument()
    expect(screen.getByText('api-v1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'web' })).toHaveAttribute(
      'href',
      '/services/default/web'
    )
    expect(screen.getByRole('link', { name: 'api' })).toHaveAttribute(
      'href',
      '/services/default/api'
    )
    expect(screen.getByRole('link', { name: 'api-v1' })).toHaveAttribute(
      'href',
      '/services/default/api-v1'
    )
    expect(screen.getAllByText('80').length).toBeGreaterThan(0)
    expect(screen.getByText('http')).toBeInTheDocument()
    expect(screen.getByText('8080')).toBeInTheDocument()
    expect(screen.queryByText('web:80')).not.toBeInTheDocument()
    expect(screen.queryByText('api:http')).not.toBeInTheDocument()
    expect(screen.queryByText('api-v1:8080')).not.toBeInTheDocument()
    expect(screen.getAllByText('app-tls')).toHaveLength(1)
    expect(screen.getByText('fallback:80')).toBeInTheDocument()
    expect(mockResourceHistoryTable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'ingresses',
        name: 'gateway',
        namespace: 'default',
        currentResource: ingress,
      })
    )
  })

  it('does not link missing backend services', () => {
    const ingress = {
      metadata: {
        name: 'gateway',
        namespace: 'default',
        creationTimestamp: '2026-05-10T13:53:27.000Z',
      },
      spec: {
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
                      name: 'missing-service',
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
      refetch: vi.fn(),
    })
    mockUseResources.mockImplementation((resource: string) => {
      if (resource === 'services') {
        return {
          data: [{ metadata: { name: 'other-service' } }],
          isLoading: false,
        }
      }

      return {
        data: [],
        isLoading: false,
      }
    })

    renderIngressDetail()

    expect(screen.getByText('missing-service')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'missing-service' })
    ).not.toBeInTheDocument()
  })

  it('opens ingress route links with inferred protocol', async () => {
    const user = userEvent.setup()
    const ingress = {
      metadata: {
        name: 'gateway',
        namespace: 'default',
        creationTimestamp: '2026-05-10T13:53:27.000Z',
      },
      spec: {
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
          {
            host: 'plain.example.com',
            http: {
              paths: [
                {
                  path: '/health',
                  pathType: 'Exact',
                  backend: {
                    service: {
                      name: 'web',
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
    } as Ingress

    mockUseResource.mockReturnValue({
      data: ingress,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderIngressDetail()

    await user.click(screen.getByRole('button', { name: /\/api/ }))
    expect(mockOpenURL).toHaveBeenCalledWith('https://app.example.com/api')

    await user.click(screen.getByRole('button', { name: /\/health/ }))
    expect(mockOpenURL).toHaveBeenCalledWith('http://plain.example.com/health')
  })

  it('keeps original host rule order when editing a single host', async () => {
    const user = userEvent.setup()
    const ingress = {
      metadata: {
        name: 'gateway',
        namespace: 'default',
        creationTimestamp: '2026-05-10T13:53:27.000Z',
      },
      spec: {
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
                      name: 'api',
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
    } as Ingress

    mockUseResource.mockReturnValue({
      data: ingress,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderIngressDetail()

    await user.click(
      screen.getAllByRole('button', { name: 'ingresses.editHostRoutes' })[1]
    )

    const editForm = within(screen.getByRole('dialog')).getByTestId(
      'ingress-edit-form'
    )
    const hostInputs = within(editForm).getAllByLabelText('ingresses.host')

    expect(hostInputs[0]).toHaveValue('app.example.com')
    expect(hostInputs[1]).toHaveValue('api.example.com')
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

    renderIngressDetail()

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
