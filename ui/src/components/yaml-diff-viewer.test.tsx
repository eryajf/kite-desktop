import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { YamlDiffViewer } from './yaml-diff-viewer'

const mockOnRollback = vi.fn()
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

vi.mock('@/lib/monaco-loader', () => ({
  MonacoDiffEditor: () => <div>monaco-diff-editor</div>,
}))

vi.mock('@/lib/monaco-theme', () => ({
  defineMonacoBackgroundThemes: vi.fn(),
  useMonacoBackgroundColor: () => '#ffffff',
}))

vi.mock('./appearance-provider', () => ({
  useAppearance: () => ({
    actualTheme: 'light',
    colorTheme: 'default',
  }),
}))

describe('YamlDiffViewer', () => {
  beforeEach(() => {
    mockOnRollback.mockReset()
  })

  it('requires confirmation before rolling back a history version', () => {
    render(
      <YamlDiffViewer
        open
        onOpenChange={vi.fn()}
        original={'kind: ConfigMap\nmetadata:\n  name: old\n'}
        modified={'kind: ConfigMap\nmetadata:\n  name: new\n'}
        current={'kind: ConfigMap\nmetadata:\n  name: current\n'}
        onRollback={mockOnRollback}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceHistory.rollback.previous',
      })
    )

    expect(mockOnRollback).not.toHaveBeenCalled()
    expect(
      screen.getByText('resourceHistory.rollback.confirmTitle')
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceHistory.rollback.confirm',
      })
    )

    expect(mockOnRollback).toHaveBeenCalledWith(
      'kind: ConfigMap\nmetadata:\n  name: old\n'
    )
  })
})
