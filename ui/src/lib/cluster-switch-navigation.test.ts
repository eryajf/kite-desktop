import { describe, expect, it } from 'vitest'

import { getClusterSwitchRedirectPath } from './cluster-switch-navigation'

describe('getClusterSwitchRedirectPath', () => {
  it('redirects regular resource detail routes to their list after cluster switch', () => {
    expect(getClusterSwitchRedirectPath('/ingresses/default/demo')).toBe(
      '/ingresses'
    )
    expect(getClusterSwitchRedirectPath('/nodes/node-a')).toBe('/nodes')
  })

  it('redirects CR detail routes to the current CRD instance list after cluster switch', () => {
    expect(
      getClusterSwitchRedirectPath(
        '/crds/widgets.example.com/default/widget-a'
      )
    ).toBe('/crds/widgets.example.com')
    expect(getClusterSwitchRedirectPath('/crds/widgets.example.com/widget-a')).toBe(
      '/crds/widgets.example.com'
    )
  })

  it('keeps list and static routes in place after cluster switch', () => {
    expect(getClusterSwitchRedirectPath('/ingresses')).toBeNull()
    expect(getClusterSwitchRedirectPath('/networking/advanced')).toBeNull()
    expect(getClusterSwitchRedirectPath('/settings')).toBeNull()
  })
})
