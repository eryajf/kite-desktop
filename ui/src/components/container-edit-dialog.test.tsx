import { render, screen } from '@testing-library/react'
import { Deployment } from 'kubernetes-types/apps/v1'
import { describe, expect, it, vi } from 'vitest'

import { ContainerEditDialog } from './container-edit-dialog'

vi.mock('@radix-ui/react-dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@radix-ui/react-dialog')>()

  return {
    ...actual,
    DialogDescription: ({
      children,
      className,
    }: {
      children: React.ReactNode
      className?: string
    }) => <p className={className}>{children}</p>,
  }
})

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

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useParams: () => ({ namespace: 'default' }),
  }
})

vi.mock('./editors', () => ({
  EnvironmentEditor: () => <div>environment-editor</div>,
  ImageEditor: () => <div>image-editor</div>,
  ProbeGroupEditor: () => <div>probe-group-editor</div>,
  ResourceEditor: () => <div>resource-editor</div>,
  VolumeMountEditor: () => <div>volume-mount-editor</div>,
  VolumeSourceEditor: () => <div>volume-source-editor</div>,
}))

const deployment = {
  metadata: {
    name: 'web',
    namespace: 'default',
  },
  spec: {
    template: {
      spec: {
        containers: [
          {
            name: 'nginx-container',
            image: 'nginx:1.0',
          },
          {
            name: 'sidecar-container',
            image: 'busybox:1.0',
          },
        ],
      },
    },
  },
} as Deployment

describe('ContainerEditDialog', () => {
  it('renders deployment containers as horizontal tabs', () => {
    render(
      <ContainerEditDialog
        open={true}
        onOpenChange={vi.fn()}
        mode="deployment"
        deployment={deployment}
        namespace="default"
        onSaveDeployment={vi.fn()}
      />
    )

    const tabList = screen.getByRole('tablist', {
      name: 'containerEditor.containerSelector',
    })
    expect(tabList).toHaveAttribute('data-slot', 'tabs-list')
    expect(tabList).toHaveClass('overflow-x-auto')
    expect(
      screen.getByRole('tablist', { name: 'containerEditor.containerSelector' })
    ).toBeInTheDocument()
    const selectedContainerTab = screen.getByRole('tab', {
      name: 'nginx-container',
    })
    expect(selectedContainerTab).toHaveAttribute('data-slot', 'tabs-trigger')
    expect(selectedContainerTab).toHaveAttribute('aria-selected', 'true')
    expect(selectedContainerTab).toHaveAttribute('data-state', 'active')
    expect(
      screen.getByRole('tab', { name: 'sidecar-container' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
