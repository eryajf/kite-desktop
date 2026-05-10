import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ContainerSelector } from './container-selector'

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

describe('ContainerSelector', () => {
  it('uses adaptive trigger and dropdown widths for long names', () => {
    render(
      <ContainerSelector
        containers={[
          {
            name: 'nginx-container',
            image: 'docker.cnb.cool/example/nginx:latest',
            init: false,
          },
          {
            name: 'sidecar-container-with-a-long-readable-name',
            image: 'docker.cnb.cool/example/sidecar:latest',
            init: false,
          },
        ]}
        selectedContainer="sidecar-container-with-a-long-readable-name"
        showAllOption={false}
        onContainerChange={vi.fn()}
      />
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('md:w-fit')
    expect(trigger).toHaveClass('md:min-w-[14rem]')
    expect(trigger).toHaveClass('md:max-w-[min(42rem,calc(100vw-2rem))]')
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
      'max-w-[min(42rem,calc(100vw-1rem))]'
    )
  })
})
