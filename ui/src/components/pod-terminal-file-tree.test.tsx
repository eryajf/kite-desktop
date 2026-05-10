import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PodTerminalFileTree } from './pod-terminal-file-tree'

const mockUsePodFiles = vi.fn()

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, string>) =>
        options?.name ? `${key}:${options.name}` : key,
    }),
  }
})

vi.mock('@/lib/api', () => ({
  usePodFiles: (...args: unknown[]) => mockUsePodFiles(...args),
}))

describe('PodTerminalFileTree', () => {
  it('lists pod directories and navigates into a directory', () => {
    mockUsePodFiles.mockReturnValue({
      data: [
        { name: 'app', isDir: true, size: '-', modTime: '', mode: '', uid: '', gid: '' },
        { name: 'README.md', isDir: false, size: '12', modTime: '', mode: '', uid: '', gid: '' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <PodTerminalFileTree
        namespace="default"
        podName="web-abc"
        containerName="nginx"
      />
    )

    expect(mockUsePodFiles).toHaveBeenLastCalledWith(
      'default',
      'web-abc',
      'nginx',
      '/',
      { enabled: true }
    )
    expect(screen.getByText('app')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'podFiles.enterDirectory:app' }))

    expect(mockUsePodFiles).toHaveBeenLastCalledWith(
      'default',
      'web-abc',
      'nginx',
      '/app',
      { enabled: true }
    )
    expect(screen.getByDisplayValue('/app')).toBeInTheDocument()
  })

  it('does not query files until pod and container are available', () => {
    mockUsePodFiles.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <PodTerminalFileTree
        namespace="default"
        podName=""
        containerName=""
      />
    )

    expect(mockUsePodFiles).toHaveBeenLastCalledWith(
      'default',
      '',
      '',
      '/',
      { enabled: false }
    )
  })
})
