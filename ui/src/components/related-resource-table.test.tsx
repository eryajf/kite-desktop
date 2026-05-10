import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { RelatedResourcesTable } from './related-resource-table'

const relatedResourcesMock = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@/lib/api', () => ({
  useRelatedResources: relatedResourcesMock,
}))

describe('RelatedResourcesTable', () => {
  function renderTable(initialPath = '/') {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <RelatedResourcesTable
          resource="deployments"
          name="demo"
          namespace="default"
        />
        <LocationProbe />
      </MemoryRouter>
    )
  }

  it('renders standard endpoint resources and unknown resources without crashing', () => {
    relatedResourcesMock.mockReturnValue({
      data: [
        { type: 'endpoints', name: 'demo', namespace: 'default' },
        {
          type: 'unknownwidgets',
          name: 'demo-widget',
          namespace: 'default',
        },
      ],
      isLoading: false,
    })

    renderTable()

    expect(screen.getByText('endpoints')).toBeInTheDocument()
    expect(screen.getByText('demo')).toHaveClass('app-link')
    expect(screen.getByText('unknownwidgets')).toBeInTheDocument()
    expect(screen.getByText('demo-widget')).not.toHaveClass('app-link')
  })

  it('groups related resources by direction', () => {
    relatedResourcesMock.mockReturnValue({
      data: [
        {
          type: 'configmaps',
          name: 'demo-config',
          namespace: 'default',
          direction: 'references',
          reason: 'pod template reference',
        },
        {
          type: 'services',
          name: 'demo-service',
          namespace: 'default',
          direction: 'referencedBy',
          reason: 'service selector matches workload pods',
        },
      ],
      isLoading: false,
    })

    renderTable()

    const references = screen
      .getByText('relatedResources.references')
      .closest('section')
    const referencedBy = screen
      .getByText('relatedResources.referencedBy')
      .closest('section')

    expect(references).not.toBeNull()
    expect(referencedBy).not.toBeNull()
    expect(within(references!).getByText('1')).toBeInTheDocument()
    expect(within(referencedBy!).getByText('1')).toBeInTheDocument()
    expect(
      within(references!).getByText('relatedResources.referencesDescription')
    ).toBeInTheDocument()
    expect(
      within(referencedBy!).getByText(
        'relatedResources.referencedByDescription'
      )
    ).toBeInTheDocument()
    expect(within(references!).getByText('demo-config')).toBeInTheDocument()
    expect(within(referencedBy!).getByText('demo-service')).toBeInTheDocument()
    expect(screen.getByText('pod template reference')).toBeInTheDocument()
    expect(
      screen.getByText('service selector matches workload pods')
    ).toBeInTheDocument()
  })

  it('closes the resource dialog when an embedded detail page sends an escape message', async () => {
    relatedResourcesMock.mockReturnValue({
      data: [{ type: 'services', name: 'demo-service', namespace: 'default' }],
      isLoading: false,
    })

    renderTable()

    fireEvent.click(screen.getByText('demo-service'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'kite:related-resource-dialog:escape' },
      })
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('navigates inside the iframe instead of opening nested dialogs', async () => {
    relatedResourcesMock.mockReturnValue({
      data: [{ type: 'services', name: 'demo-service', namespace: 'default' }],
      isLoading: false,
    })

    renderTable('/deployments/default/demo?iframe=true')

    fireEvent.click(screen.getByRole('button', { name: 'demo-service' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/services/default/demo-service?iframe=true'
    )
  })
})

function LocationProbe() {
  const location = useLocation()

  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  )
}
