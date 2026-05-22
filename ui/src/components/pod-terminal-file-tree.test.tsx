import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PodTerminalFileTree } from './pod-terminal-file-tree'

const mockUsePodFiles = vi.fn()
const mockCopyTextToClipboard = vi.fn()
const mockPodDownloadFile = vi.fn()
const mockPodReadFileContent = vi.fn()
const mockPodUpdateFileContent = vi.fn()
const mockPodUploadFile = vi.fn()
const mockPodDeleteFile = vi.fn()
const mockPodListFiles = vi.fn()

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
  podListFiles: (...args: unknown[]) => mockPodListFiles(...args),
  podDownloadFile: (...args: unknown[]) => mockPodDownloadFile(...args),
  podReadFileContent: (...args: unknown[]) => mockPodReadFileContent(...args),
  podUpdateFileContent: (...args: unknown[]) =>
    mockPodUpdateFileContent(...args),
  podUploadFile: (...args: unknown[]) => mockPodUploadFile(...args),
  podDeleteFile: (...args: unknown[]) => mockPodDeleteFile(...args),
}))

vi.mock('@/lib/desktop', () => ({
  copyTextToClipboard: (...args: unknown[]) => mockCopyTextToClipboard(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('PodTerminalFileTree', () => {
  it('lists pod directories and lazily expands a directory', () => {
    mockUsePodFiles.mockReturnValue({
      data: [
        { name: 'app', isDir: true, size: '-', modTime: '', mode: '', uid: '', gid: '' },
        { name: 'README.md', isDir: false, size: '12', modTime: '', mode: '', uid: '', gid: '' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockPodListFiles.mockResolvedValue([
      {
        name: 'config.yaml',
        isDir: false,
        size: '42',
        modTime: '',
        mode: '',
        uid: '',
        gid: '',
      },
    ])

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

    expect(mockPodListFiles).toHaveBeenLastCalledWith(
      'default',
      'web-abc',
      'nginx',
      '/app',
      undefined
    )
    expect(screen.getByDisplayValue('/')).toBeInTheDocument()
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

  it('passes the frozen cluster name when provided', () => {
    mockUsePodFiles.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <PodTerminalFileTree
        clusterName="cluster-a"
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
      { enabled: true, clusterName: 'cluster-a' }
    )
  })
})
