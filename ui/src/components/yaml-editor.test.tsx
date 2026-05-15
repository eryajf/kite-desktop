import '@/i18n'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { YamlEditor } from './yaml-editor'

const originalYaml =
  'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\n'

vi.mock('@/lib/monaco-loader', () => ({
  MonacoEditor: ({
    value,
    onChange,
    options,
  }: {
    value: string
    onChange?: (value: string | undefined) => void
    options?: { readOnly?: boolean }
  }) => (
    <textarea
      aria-label="yaml-editor"
      readOnly={options?.readOnly}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  MonacoDiffEditor: ({
    original,
    modified,
  }: {
    original: string
    modified: string
  }) => (
    <div aria-label="yaml-diff-editor">
      <pre data-testid="diff-original">{original}</pre>
      <pre data-testid="diff-modified">{modified}</pre>
    </div>
  ),
}))

describe('YamlEditor', () => {
  it('opens in view mode and switches to edit mode from the edit button', () => {
    render(<YamlEditor<'configmaps'> value={originalYaml} />)

    expect(screen.getByLabelText('yaml-editor')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /save/i })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))

    expect(screen.getByLabelText('yaml-editor')).not.toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('restores the original YAML when editing is canceled', () => {
    const handleChange = vi.fn()

    render(
      <YamlEditor<'configmaps'> value={originalYaml} onChange={handleChange} />
    )

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText('yaml-editor'), {
      target: {
        value: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: changed\n',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.getByLabelText('yaml-editor')).toHaveValue(originalYaml)
    expect(handleChange).toHaveBeenLastCalledWith(originalYaml)
    expect(screen.getByLabelText('yaml-editor')).toHaveAttribute('readonly')
  })

  it('shows a diff before saving changed YAML and saves after confirmation', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined)
    const modifiedYaml =
      'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: changed\n'

    render(
      <YamlEditor<'configmaps'> value={originalYaml} onSave={handleSave} />
    )

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText('yaml-editor'), {
      target: { value: modifiedYaml },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(handleSave).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('diff-original').textContent).toBe(originalYaml)
    expect(screen.getByTestId('diff-modified').textContent).toBe(modifiedYaml)

    fireEvent.click(screen.getByRole('button', { name: /confirm save/i }))

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ name: 'changed' }),
        })
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('yaml-editor')).toHaveAttribute('readonly')
    })
  })

  it('continues editing from the diff dialog without saving', () => {
    const handleSave = vi.fn()

    render(
      <YamlEditor<'configmaps'> value={originalYaml} onSave={handleSave} />
    )

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText('yaml-editor'), {
      target: {
        value: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: changed\n',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue editing/i }))

    expect(handleSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('yaml-editor')).not.toHaveAttribute('readonly')
  })

  it('keeps the diff open and stays editable when save returns false', async () => {
    const handleSave = vi.fn().mockResolvedValue(false)

    render(
      <YamlEditor<'configmaps'> value={originalYaml} onSave={handleSave} />
    )

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText('yaml-editor'), {
      target: {
        value: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: changed\n',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm save/i }))

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalled()
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('yaml-editor')).not.toHaveAttribute('readonly')
  })

  it('exits edit mode without opening diff when YAML is unchanged', () => {
    const handleSave = vi.fn()

    render(
      <YamlEditor<'configmaps'> value={originalYaml} onSave={handleSave} />
    )

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(handleSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('yaml-editor')).toHaveAttribute('readonly')
  })
})
