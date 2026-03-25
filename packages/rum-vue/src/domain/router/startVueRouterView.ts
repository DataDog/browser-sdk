import { display } from '@datadog/browser-core'
import type { RouteLocationMatched } from 'vue-router'
import { onRumInit } from '../vuePlugin'

export function startVueRouterView(matched: RouteLocationMatched[], path: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the vue plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(matched, path))
  })
}

export function computeViewName(matched: RouteLocationMatched[], path: string): string {
  if (!matched || matched.length === 0) {
    return ''
  }

  let viewName = '/'

  for (const routeRecord of matched) {
    const routePath = routeRecord.path
    if (!routePath) {
      continue
    }

    // Note: Vue Router normalizes all paths in the matched array to absolute paths,
    // so the relative-path branch below is purely defensive and not expected to be
    // hit in practice. It mirrors the React Router implementation for consistency.
    if (routePath.startsWith('/')) {
      viewName = routePath
    } else {
      if (!viewName.endsWith('/')) {
        viewName += '/'
      }
      viewName += routePath
    }
  }

  return substituteCatchAll(viewName, path)
}

/**
 * Vue Router catch-all routes use `/:pathMatch(.*)*` instead of bare `*` like React Router.
 * Keeping the raw pattern as the view name isn't helpful, it hides information about which
 * path was actually visited. This function replaces the catch-all segment with the actual
 * URL path, aligning with how the React integration substitutes splats.
 *
 * We match the full `/:pathMatch(.*)*` pattern rather than just `:pathMatch(` to avoid
 * false positives on custom regex params (e.g. `/:pathMatch([a-z]+)`).
 *
 * @example
 * substituteCatchAll('/:pathMatch(.*)*', '/unknown/page') // => '/unknown/page'
 */
function substituteCatchAll(viewName: string, path: string): string {
  if (!viewName.includes(':pathMatch(.*)*')) {
    return viewName
  }

  return path
}
