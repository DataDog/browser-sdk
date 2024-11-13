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

    path = substitutePathSplats(path, routeMatch.params, routeMatch === routeMatches[routeMatches.length - 1])

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

/**
 * React-Router allows to define routes with "splats" (or "catchall" or "star") segments[1],
 * example: /files/*. It has been noticed that keeping those splats in the view name isn't helpful
 * as it "hides" too much information. This function replaces the splats with the actual URL path
 * name that they are matching.
 *
 * [1]: https://reactrouter.com/en/main/route/route#splats
 *
 * @example
 * substitutePathSplats('/files/*', { '*': 'path/to/file' }, true) // => '/files/path/to/file'
 */
function substitutePathSplats(path: string, params: Record<string, string | undefined>, isLastMatchingRoute: boolean) {
  if (
    !path.includes('*') ||
    // In some edge cases, react-router does not provide the `*` parameter, so we don't know what to
    // replace it with. In this case, we keep the asterisk.
    !params['*']
  ) {
    return path
  }

  // The `*` parameter is only related to the last matching route path.
  if (isLastMatchingRoute) {
    return path.replace(/\*/, params['*'])
  }

  // Intermediary route paths with a `*` are kind of edge cases, and the `*` parameter is not
  // relevant for them. We remove it from the path (along with a potential slash preceeding it) to
  // have a coherent view name once everything is concatenated (see examples in spec file).
  return path.replace(/\/?\*/, '')
}
