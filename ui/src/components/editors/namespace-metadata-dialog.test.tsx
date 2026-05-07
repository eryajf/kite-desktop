import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Namespace } from 'kubernetes-types/core/v1'
import { describe, expect, it, vi } from 'vitest'

import { NamespaceMetadataDialog } from './namespace-metadata-dialog'

const mockInvalidateQueries = vi.fn()
const mockUpdateResource = vi.fn()

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  }
})

vi.mock('@/lib/api', () => ({
  updateResource: (...args: unknown[]) => mockUpdateResource(...args),
}))

describe('NamespaceMetadataDialog', () => {
  it('shows existing items and supports add and delete before save', async () => {
    const namespace = {
      metadata: {
        name: 'team-a',
        labels: {
          env: 'prod',
          owner: 'platform',
        },
      },
    } as Namespace

    render(
      <NamespaceMetadataDialog
        open={true}
        onOpenChange={() => undefined}
        namespace={namespace}
        type="labels"
      />
    )

    expect(screen.getByDisplayValue('env')).toBeInTheDocument()
    expect(screen.getByDisplayValue('prod')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    const keyInputs = screen.getAllByPlaceholderText('common.key')
    const valueInputs = screen.getAllByPlaceholderText('common.value')

    expect(keyInputs[0]).toHaveValue('')
    expect(valueInputs[0]).toHaveValue('')

    fireEvent.change(keyInputs[0], { target: { value: 'tier' } })
    fireEvent.change(valueInputs[0], { target: { value: 'backend' } })

    fireEvent.click(screen.getAllByRole('button', { name: 'common.remove' })[2])
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(mockUpdateResource).toHaveBeenCalledWith(
        'namespaces',
        'team-a',
        undefined,
        expect.objectContaining({
          metadata: expect.objectContaining({
            labels: {
              env: 'prod',
              tier: 'backend',
            },
          }),
        })
      )
    })
  })

  it('keeps actions visible with a scrollable content area', () => {
    const namespace = {
      metadata: {
        name: 'team-a',
        labels: Object.fromEntries(
          Array.from({ length: 12 }, (_, index) => [
            `key-${index}`,
            `value-${index}`,
          ])
        ),
      },
    } as Namespace

    render(
      <NamespaceMetadataDialog
        open={true}
        onOpenChange={() => undefined}
        namespace={namespace}
        type="labels"
      />
    )

    const dialogContent = document.querySelector('[data-slot="dialog-content"]')
    expect(dialogContent).toHaveClass('h-[85vh]')
    expect(dialogContent).toHaveClass('max-h-[85vh]')
    expect(dialogContent).toHaveClass('overflow-hidden')

    const scrollArea = screen
      .getByRole('button', { name: 'common.save' })
      .closest('form')
    expect(scrollArea).toHaveClass('min-h-0')
    expect(scrollArea).toHaveClass('overflow-hidden')

    const footer = screen.getByRole('button', {
      name: 'common.save',
    }).parentElement
    expect(footer).toHaveClass('border-t')
    expect(footer).toHaveClass('shrink-0')
  })

  it('uses a more compact dialog height when there are only a few items', () => {
    const namespace = {
      metadata: {
        name: 'team-a',
        labels: {
          env: 'prod',
          owner: 'platform',
        },
      },
    } as Namespace

    render(
      <NamespaceMetadataDialog
        open={true}
        onOpenChange={() => undefined}
        namespace={namespace}
        type="labels"
      />
    )

    const dialogContent = document.querySelector('[data-slot="dialog-content"]')
    expect(dialogContent).not.toHaveClass('h-[85vh]')
    expect(dialogContent).toHaveClass('max-h-[65vh]')
    expect(dialogContent).toHaveClass('overflow-hidden')
  })
})
