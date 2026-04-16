import { display } from '@datadog/browser-core'
import type { AngularActivatedRouteSnapshot } from './types'
import { onRumInit } from '../angularPlugin'

export function startAngularView(pathFromRoot: AngularActivatedRouteSnapshot[], urlPath: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the angular plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(pathFromRoot, urlPath))
  })
}

export function computeViewName(pathFromRoot: AngularActivatedRouteSnapshot[], urlPath: string): string {
  if (!pathFromRoot || pathFromRoot.length === 0) {
    return ''
  }

  let viewName = '/'

  for (const snapshot of pathFromRoot) {
    const routePath = snapshot.routeConfig?.path
    if (!routePath) {
      continue
    }

    // Angular route paths are always relative (no leading slash), but handle
    // absolute paths defensively for consistency with the Vue implementation.
    if (routePath.startsWith('/')) {
      viewName = routePath
    } else {
      if (!viewName.endsWith('/')) {
        viewName += '/'
      }
      viewName += routePath
    }
  }

  return substituteCatchAll(viewName, urlPath)
}

/**
 * Angular catch-all routes use the `**` wildcard. Keeping `/**` as the view name
 * hides information about which path was actually visited. This function replaces
 * the catch-all segment with the corresponding portion of the actual URL path,
 * preserving any parameterized segments that precede it.
 *
 * @example
 * substituteCatchAll('/**', '/unknown/page') // => '/unknown/page'
 * substituteCatchAll('/org/:orgId/**', '/org/123/some/page') // => '/org/:orgId/some/page'
 */
function substituteCatchAll(viewName: string, urlPath: string): string {
  const catchAllPattern = '/**'
  const catchAllIndex = viewName.indexOf(catchAllPattern)
  if (catchAllIndex === -1) {
    return viewName
  }

  const prefix = viewName.substring(0, catchAllIndex)
  const prefixSegmentCount = prefix === '' ? 0 : prefix.split('/').length - 1
  const pathSegments = urlPath.split('/')
  const suffix = pathSegments.slice(prefixSegmentCount + 1).join('/')

  return prefix + (suffix ? `/${suffix}` : '') || '/'
}
