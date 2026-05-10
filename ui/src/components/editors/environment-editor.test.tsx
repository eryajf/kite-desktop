import { fireEvent, render, screen } from '@testing-library/react'
import type { Container } from 'kubernetes-types/core/v1'
import { describe, expect, it, vi } from 'vitest'

import { EnvironmentEditor } from './environment-editor'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('../selector/configmap-selector', () => ({
  ConfigMapSelector: ({
    selectedConfigMap,
    onConfigMapChange,
    placeholder,
  }: {
    selectedConfigMap: string
    onConfigMapChange: (value: string) => void
    placeholder: string
  }) => (
    <input
      aria-label={placeholder}
      value={selectedConfigMap}
      onChange={(event) => onConfigMapChange(event.target.value)}
    />
  ),
}))

vi.mock('../selector/secret-selector', () => ({
  SecretSelector: ({
    selectedSecret,
    onSecretChange,
    placeholder,
  }: {
    selectedSecret: string
    onSecretChange: (value: string) => void
    placeholder: string
  }) => (
    <input
      aria-label={placeholder}
      value={selectedSecret}
      onChange={(event) => onSecretChange(event.target.value)}
    />
  ),
}))

describe('EnvironmentEditor', () => {
  it('adds new environment variables at the top', () => {
    const onUpdate = vi.fn()
    const container = {
      name: 'app',
      env: [{ name: 'EXISTING', value: 'one' }],
    } as Container

    render(
      <EnvironmentEditor
        container={container}
        namespace="default"
        onUpdate={onUpdate}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /environmentEditor.addVariable/ })
    )

    const nameInputs = screen.getAllByPlaceholderText(
      'environmentEditor.variableNamePlaceholder'
    )
    expect(nameInputs[0]).toHaveValue('')
    expect(nameInputs[1]).toHaveValue('EXISTING')
    expect(onUpdate).toHaveBeenLastCalledWith({
      env: [
        { name: '', value: '' },
        { name: 'EXISTING', value: 'one' },
      ],
    })
  })

  it('adds new environment sources at the top', () => {
    const onUpdate = vi.fn()
    const container = {
      name: 'app',
      envFrom: [{ secretRef: { name: 'existing-secret' } }],
    } as Container

    render(
      <EnvironmentEditor
        container={container}
        namespace="default"
        onUpdate={onUpdate}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /environmentEditor.addSource/ })
    )

    const sourceInputs = screen.getAllByLabelText(
      'environmentEditor.selectConfigMap'
    )
    expect(sourceInputs[0]).toHaveValue('')
    expect(onUpdate).toHaveBeenLastCalledWith({
      envFrom: [{ secretRef: { name: 'existing-secret' } }],
    })
  })
})
