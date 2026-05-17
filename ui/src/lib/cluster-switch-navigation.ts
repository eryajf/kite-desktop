export function getClusterSwitchRedirectPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  const staticTwoSegmentRoutes = new Set(['networking/advanced'])
  const routeKey = segments.join('/')

  if (staticTwoSegmentRoutes.has(routeKey)) {
    return null
  }

  if (segments[0] === 'crds') {
    if (segments.length === 3 || segments.length === 4) {
      return `/crds/${segments[1]}`
    }
    return null
  }

  if (segments.length === 2 || segments.length === 3) {
    return `/${segments[0]}`
  }

  return null
}
