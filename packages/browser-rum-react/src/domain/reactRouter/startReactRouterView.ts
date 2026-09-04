import { clocksNow } from '@datadog/js-core/time'
import { display } from '@datadog/browser-core'
import { startViewSuperseding } from '@datadog/browser-rum-core'
import { onRumInit } from '../reactPlugin'
import type { AnyRouteMatch } from './types'

export function startReactRouterView(routeMatches: AnyRouteMatch[]) {
  onRumInit((configuration, _publicApi, internalApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the react plugin configuration, the view will not be tracked.')
      return
    }
    // v3 (plan-v3.md): the view-tracking policy (stop the open view at the new view's start)
    // lives in the shared supersede helper — the internal API itself is agnostic of the
    // single-view rule. The initial version is emitted by the API itself: no handle bookkeeping,
    // no update({}) dance. The view starts as soon as the plugin initializes (even before the
    // session manager resolves): the internal API buffers it.
    startViewSuperseding(
      internalApi,
      { type: 'view', view: { url: location.href, name: computeViewName(routeMatches) } },
      { startClocks: clocksNow() }
    )
  })
}

export function computeViewName(routeMatches: AnyRouteMatch[]) {
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
    params['*'] === undefined
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
