import type { RouteMatch } from 'react-router-dom'
import { display } from '@datadog/browser-core'
import { onReactPluginInit } from '../reactPlugin'

export function startReactRouterView(routeMatches: RouteMatch[]) {
  onReactPluginInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the react plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(routeMatches))
  })
}

export function computeViewName(routeMatches: RouteMatch[]) {
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
      if (path === '*') {
        viewName += routeMatch.params['*']!
      } else {
        viewName += path
      }
    }
  }

  return viewName
}
