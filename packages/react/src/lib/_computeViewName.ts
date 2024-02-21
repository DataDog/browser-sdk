import type { RouteMatch } from '../entries/types'

// Compute view name out of routeMatches
export function _computeViewName(routeMatches: RouteMatch[] = []) {
  let viewName = ''
  if (!routeMatches || routeMatches.length === 0) {
    return viewName
  }
  for (let index = 0; index < routeMatches.length; index++) {
    const routeMatch = routeMatches[index]
    const path = routeMatch.route.path
    // Skip pathless routes
    if (!path) {
      continue
    }

    if (path.startsWith('/')) {
      // Handle absolute child route paths
      viewName = path
    } else {
      // Handle route paths ending with "/"
      viewName += viewName.endsWith('/') ? path : `/${path}`
    }
  }

  return viewName || '/'
}
