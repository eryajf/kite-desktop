import { render, screen } from '@testing-library/react'
import type { Container } from 'kubernetes-types/core/v1'
import { describe, expect, it, vi } from 'vitest'

import { ContainerImagesSummary, toCompactImageName } from './container-images-summary'

vi.mock('./ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}))

describe('ContainerImagesSummary', () => {
  it('formats compact image names', () => {
    expect(toCompactImageName('docker.cnb.cool/znb/images/nginx:1.24')).toBe(
      'nginx:1.24'
    )
    expect(toCompactImageName('repo/app@sha256:abcdef')).toBe(
      'app@sha256:abcdef'
    )
  })

  it('uses higher-contrast text styles inside the tooltip', () => {
    const containers = [
      {
        name: 'nginx-container',
        image: 'docker.cnb.cool/znb/images/nginx:1.24',
      },
      {
        name: 'sidecar-container',
        image: 'docker.cnb.cool/znb/images/busybox',
      },
    ] as Container[]

    render(<ContainerImagesSummary containers={containers} />)

    const name = screen.getByText('nginx-container')
    const image = screen.getByText('docker.cnb.cool/znb/images/nginx:1.24')

    expect(name).toHaveClass('font-medium')
    expect(name).toHaveClass('text-primary-foreground/80')
    expect(image).toHaveClass('text-primary-foreground')
  })
})
