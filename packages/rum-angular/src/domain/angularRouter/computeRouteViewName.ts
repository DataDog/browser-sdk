import type { RouteSnapshot } from './types'

const PRIMARY_OUTLET = 'primary'

export function computeRouteViewName(root: RouteSnapshot): string {
  const segments: string[] = []
  let current: RouteSnapshot | undefined = root

  while (current) {
    const path = current.routeConfig?.path

    if (path === '**') {
      for (const segment of current.url) {
        segments.push(segment.path)
      }
      break
    }

    if (path) {
      segments.push(path)
    }

    // Follow primary outlet only — named outlets (e.g. sidebar) are excluded
    current = current.children.find((child) => child.outlet === PRIMARY_OUTLET)
  }

  if (segments.length === 0) {
    return '/'
  }

  return `/${segments.join('/')}`
}
