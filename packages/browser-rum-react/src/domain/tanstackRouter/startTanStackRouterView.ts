import { clocksNow } from '@datadog/js-core/time'
import { display } from '@datadog/browser-core'
import type { ViewEventHandle } from '@datadog/browser-rum-core'
import { onRumInit } from '../reactPlugin'
import type { AnyTanStackRouteMatch } from './types'

let currentViewHandle: ViewEventHandle | undefined

export function startTanStackRouterView(routeMatches: AnyTanStackRouteMatch[]) {
  onRumInit((configuration, _publicApi, internalApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the react plugin configuration, the view will not be tracked.')
      return
    }
    const startClocks = clocksNow()
    // Throw-on-double-view makes the router contract explicit: stop the previous view before
    // starting the new one, at the new view's start time. The view starts as soon as the plugin
    // initializes (even before the session manager resolves): the internal API buffers it.
    currentViewHandle?.stop(undefined, { endClocks: startClocks })
    currentViewHandle = internalApi.startEvent(
      { type: 'view', view: { url: location.href, name: computeViewName(routeMatches) } },
      { startClocks }
    )
    // Views are sent incrementally: emit the initial version right away (see /plan.md, phase 3a
    // finding)
    currentViewHandle.update({})
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
