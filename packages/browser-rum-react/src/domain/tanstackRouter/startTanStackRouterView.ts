import { clocksNow } from '@datadog/js-core/time'
import { display } from '@datadog/browser-core'
import { onRumInit } from '../reactPlugin'
import type { AnyTanStackRouteMatch } from './types'

export function startTanStackRouterView(routeMatches: AnyTanStackRouteMatch[]) {
  onRumInit((configuration, _publicApi, internalApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the react plugin configuration, the view will not be tracked.')
      return
    }
    // v2 (plan-v2.md): starting a view supersedes the previous one (the internal API closes its
    // activity window at the new view's start and assembles its final version), and the initial
    // version is emitted by the API itself — no stop boilerplate, no update({}) dance. The view
    // starts as soon as the plugin initializes (even before the session manager resolves): the
    // internal API buffers it.
    internalApi.startEvent(
      { type: 'view', view: { url: location.href, name: computeViewName(routeMatches) } },
      { startClocks: clocksNow() }
    )
  })
}

export function computeViewName(routeMatches: AnyTanStackRouteMatch[]) {
  if (routeMatches.length === 0) {
    return ''
  }

  // TanStack Router provides `fullPath` on each match, which is the route template
  // with param placeholders (e.g., "/posts/$postId"). The last match is the most
  // specific route, and its fullPath is the complete view name.
  const lastMatch = routeMatches[routeMatches.length - 1]
  let viewName = lastMatch.fullPath

  // Handle splat routes: TanStack uses bare "$" for catch-all segments.
  // Replace the splat placeholder with the actual matched path for better readability,
  // consistent with how the React Router integration handles "*" splats.
  viewName = substitutePathSplats(viewName, lastMatch.params)

  // Remove trailing slash (e.g. "/posts/" → "/posts") happening when the last match is an index route
  if (viewName.endsWith('/')) {
    viewName = viewName.slice(0, -1)
  }

  return viewName || '/'
}

/**
 * TanStack Router uses a bare "$" for catch-all (splat) segments.
 * Example: "/files/$" with params._splat = "path/to/file" → "/files/path/to/file"
 *
 * Keeping the "$" in the view name isn't helpful as it hides information.
 * We replace it with the actual matched path, consistent with React Router's "*" handling.
 */
function substitutePathSplats(path: string, params: Record<string, string | undefined>): string {
  if (!path.endsWith('/$') || params._splat === undefined) {
    return path
  }

  return path.replace(/\/\$$/, `/${params._splat}`)
}
