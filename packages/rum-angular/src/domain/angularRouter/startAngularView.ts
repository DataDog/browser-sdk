import { display } from '@datadog/browser-core'
import { onRumInit } from '../angularPlugin'
import type { AngularActivatedRouteSnapshot } from './types'

export function startAngularRouterView(root: AngularActivatedRouteSnapshot, urlAfterRedirects: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the angular plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(root, urlAfterRedirects))
  })
}

export function computeViewName(root: AngularActivatedRouteSnapshot | null, urlAfterRedirects: string): string {
  if (!root) {
    return ''
  }

  let viewName = '/'
  let node: AngularActivatedRouteSnapshot | null = root.firstChild

  while (node) {
    const routePath = node.routeConfig?.path
    if (routePath) {
      if (!viewName.endsWith('/')) {
        viewName += '/'
      }
      viewName += routePath
    }
    node = node.firstChild
  }

  return substituteCatchAll(viewName, urlAfterRedirects)
}

/**
 * Angular uses `**` as the catch-all wildcard path. Keeping the raw pattern as the view
 * name isn't useful, it hides which path was actually visited. This function replaces
 * only the catch-all segment with the corresponding portion of the actual URL, preserving
 * any parameterized segments that precede it. This aligns with how the Vue and React
 * integrations substitute their catch-all patterns.
 *
 * @example
 * substituteCatchAll('/**', '/unknown/page') // => '/unknown/page'
 * substituteCatchAll('/org/:orgId/**', '/org/123/some/page') // => '/org/:orgId/some/page'
 */
function substituteCatchAll(viewName: string, path: string): string {
  const catchAllIndex = viewName.indexOf('/**')
  if (catchAllIndex === -1) {
    return viewName
  }

  const prefix = viewName.substring(0, catchAllIndex)
  const prefixSegmentCount = prefix === '' ? 0 : prefix.split('/').length - 1
  const pathSegments = stripQueryAndFragment(path).split('/')
  const suffix = pathSegments.slice(prefixSegmentCount + 1).join('/')

  return prefix + (suffix ? `/${suffix}` : '') || '/'
}

function stripQueryAndFragment(path: string): string {
  const queryIndex = path.search(/[?#]/)
  return queryIndex === -1 ? path : path.substring(0, queryIndex)
}
