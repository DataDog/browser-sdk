import { display } from '@datadog/browser-core'
import { onRumInit } from '../solidPlugin'
import type { AnyRouteMatch } from './types'

export function startSolidRouterView(routeMatches: AnyRouteMatch[]) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the solid plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(routeMatches))
  })
}

export function computeViewName(routeMatches: AnyRouteMatch[]) {
  if (!routeMatches || routeMatches.length === 0) {
    return ''
  }

  let viewName = '/'

  for (const routeMatch of routeMatches) {
    const path = routeMatch.route.path
    if (!path) {
      continue
    }

    if (path.startsWith('/')) {
      // Absolute path, replace the current view name
      viewName = path
    } else {
      // Relative path, append to the current view name
      if (!viewName.endsWith('/')) {
        viewName += '/'
      }
      viewName += path
    }
  }

  return viewName
}
