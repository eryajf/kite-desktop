import { type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NamespaceListPage } from './namespace-list-page'

const mockNavigate = vi.fn()
const mockResourceTable = vi.fn(
  ({
    onCreateClick,
    showCreateButton,
  }: {
    onCreateClick?: () => void
    showCreateButton?: boolean
  }) => (
    <div>
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

vi.mock('@/components/resource-table', () => ({
  ResourceTable: (props: {
    onCreateClick?: () => void
    showCreateButton?: boolean
  }) => mockResourceTable(props),
}))

vi.mock('@/components/editors/namespace-create-dialog', () => ({
  NamespaceCreateDialog: ({
    open,
    onSuccess,
  }: {
    open: boolean
    onSuccess: (namespace: { metadata?: { name?: string } }) => void
  }) =>
    open ? (
      <div>
        <span>namespace-create-dialog</span>
        <button
          onClick={() => onSuccess({ metadata: { name: 'new-namespace' } })}
        >
          finish-create
        </button>
      </div>
    ) : null,
}))

describe('NamespaceListPage', () => {
  it('shows create action and navigates after namespace creation', () => {
    render(<NamespaceListPage />)

    expect(screen.getByText('create-enabled')).toBeInTheDocument()

    fireEvent.click(screen.getByText('open-create'))
    expect(screen.getByText('namespace-create-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByText('finish-create'))
    expect(mockNavigate).toHaveBeenCalledWith('/namespaces/new-namespace')
  })
})
