import { render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./App', () => ({
  __esModule: true,
  default: () => <div>app shell</div>,
  StandaloneAIChatApp: () => <div>standalone ai chat</div>,
}))

vi.mock('./pages/overview', () => ({
  Overview: () => <div>overview page</div>,
}))

vi.mock('./pages/settings', () => ({
  SettingsPage: () => <div>settings page</div>,
}))

vi.mock('./pages/cr-list-page', () => ({
  CRListPage: () => <div>cr list page</div>,
}))

vi.mock('./pages/resource-detail', () => ({
  ResourceDetail: () => <div>resource detail page</div>,
}))

vi.mock('./pages/resource-list', () => ({
  ResourceList: () => <div>resource list page</div>,
}))

vi.mock('./lib/subpath', () => ({
  getSubPath: () => '/',
}))

import { router } from './routes'

function renderRouter(path: string) {
  window.history.pushState({}, '', path)
  return render(<RouterProvider router={router} />)
}

describe('router', () => {
  it('renders the root app without login/setup guards', async () => {
    renderRouter('/')

    expect(await screen.findByText('app shell')).toBeInTheDocument()
    expect(screen.queryByTestId('init-check-route')).not.toBeInTheDocument()
    expect(screen.queryByTestId('protected-route')).not.toBeInTheDocument()
  })

  it('does not register /login or /setup routes', () => {
    const routes = (
      router as unknown as {
        routes: Array<{ path?: string }>
      }
    ).routes

    expect(routes.some((route) => route.path === '/login')).toBe(false)
    expect(routes.some((route) => route.path === '/setup')).toBe(false)
  })
})
