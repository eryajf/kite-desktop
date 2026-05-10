import { render, screen } from '@testing-library/react'
import type { Pod } from 'kubernetes-types/core/v1'
import { describe, expect, it, vi } from 'vitest'

import { PodMonitoring } from './pod-monitoring'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@/lib/api', () => ({
  usePodMetrics: () => ({
    data: {
      cpu: [],
      memory: [],
      networkIn: [],
      networkOut: [],
      diskRead: [],
      diskWrite: [],
    },
    isLoading: false,
    error: null,
  }),
}))

vi.mock('./chart/cpu-usage-chart', () => ({
  default: () => <div>cpu-chart</div>,
}))

vi.mock('./chart/memory-usage-chart', () => ({
  default: () => <div>memory-chart</div>,
}))

vi.mock('./chart/network-usage-chart', () => ({
  default: () => <div>network-chart</div>,
}))

vi.mock('./chart/disk-io-usage-chart', () => ({
  default: () => <div>disk-chart</div>,
}))

vi.mock('@/components/selector/container-selector', () => ({
  ContainerSelector: () => <div data-testid="container-selector" />,
}))

vi.mock('./selector/pod-selector', () => ({
  PodSelector: () => <div data-testid="pod-selector" />,
}))

describe('PodMonitoring', () => {
  it('keeps container and pod selector controls wide enough for long names', () => {
    const pods = [
      {
        metadata: {
          name: 'multi-container-deployment-7fb66588d5-gjm6z',
          uid: 'pod-1',
        },
      },
      {
        metadata: {
          name: 'multi-container-deployment-7fb66588d5-k9p4m',
          uid: 'pod-2',
        },
      },
    ] as Pod[]

    render(
      <PodMonitoring
        namespace="default"
        pods={pods}
        containers={[{ name: 'nginx-container', image: 'nginx:latest' }]}
      />
    )

    const containerWrapper = screen
      .getByTestId('container-selector')
      .parentElement
    const podWrapper = screen.getByTestId('pod-selector').parentElement

    expect(containerWrapper).toHaveClass('md:shrink-0')
    expect(containerWrapper).toHaveClass('md:min-w-[14rem]')
    expect(podWrapper).toHaveClass('md:shrink-0')
    expect(podWrapper).toHaveClass('md:min-w-[18rem]')
  })
})
