import '@/i18n'

import { fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import { DeleteConfirmationDialog } from './delete-confirmation-dialog'

describe('DeleteConfirmationDialog', () => {
  it('requires the global confirmation keyword before allowing deletion', () => {
    void i18n.changeLanguage('zh')
    const onConfirm = vi.fn()

    render(
      <DeleteConfirmationDialog
        open={true}
        onOpenChange={() => undefined}
        resourceName="demo"
        resourceType="deployments"
        onConfirm={onConfirm}
      />
    )

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
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
