import { fireEvent, render, screen } from '@testing-library/react'
import type { Pod } from 'kubernetes-types/core/v1'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { PodSelector } from './pod-selector'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

beforeAll(() => {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserver)
  Element.prototype.scrollIntoView = vi.fn()
})

describe('PodSelector', () => {
  it('uses adaptive trigger and dropdown widths for long pod names', () => {
    const pods = [
      {
        metadata: {
          name: 'multi-container-deployment-7fb66588d5-gjm6z',
          uid: 'pod-1',
        },
      },
    ] as Pod[]

    render(
      <PodSelector
        pods={pods}
        selectedPod="multi-container-deployment-7fb66588d5-gjm6z"
        onPodChange={vi.fn()}
      />
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('md:w-fit')
    expect(trigger).toHaveClass('md:min-w-[18rem]')
    expect(trigger).toHaveClass('md:max-w-[min(48rem,calc(100vw-2rem))]')
    expect(trigger).not.toHaveClass('md:max-w-[300px]')

    fireEvent.click(trigger)

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]'
    )
    expect(popoverContent).toHaveClass('w-max')
    expect(popoverContent).toHaveClass(
      'min-w-[var(--radix-popover-trigger-width)]'
    )
    expect(popoverContent).toHaveClass(
      'max-w-[min(48rem,calc(100vw-1rem))]'
    )
  })
})
