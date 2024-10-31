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
    let path = routeMatch.route.path
    if (!path) {
      continue
    }

    path = substitutePathWildcards(path, routeMatch.params, routeMatch === routeMatches[routeMatches.length - 1])

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

function substitutePathWildcards(
  path: string,
  params: Record<string, string | undefined>,
  isLastMatchingRoute: boolean
) {
  if (!path.includes('*') || !params['*']) {
    return path
  }

  if (isLastMatchingRoute) {
    // Only replace the asterisk for the last matching route
    return path.replace(/\*/, params['*'])
  }

  // Else remove the asterisk (and a potential slash preceding it)
  return path.replace(/\/?\*/, '')
}
