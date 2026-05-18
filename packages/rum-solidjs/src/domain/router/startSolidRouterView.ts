import { display } from "@datadog/browser-core"
import type { RouteMatch } from "@solidjs/router"
import { onRumInit } from "../solidjsPlugin"

export function startSolidRouterView(matches: RouteMatch[], pathname: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn("`router: true` is missing from the solidjs plugin configuration, the view will not be tracked.")
      return
    }
    rumPublicApi.startView(computeViewName(matches, pathname))
  })
}

export function computeViewName(matches: RouteMatch[], pathname: string): string {
  if (!matches || matches.length === 0) {
    return ""
  }

  let viewName = "/"

  for (const match of matches) {
    const routePath = match.route.path
    if (!routePath) {
      continue
    }

    if (routePath.startsWith("/")) {
      viewName = routePath
    } else {
      if (!viewName.endsWith("/")) {
        viewName += "/"
      }
      viewName += routePath
    }
  }

  return substituteCatchAll(viewName, pathname)
}

/**
 * SolidJS Router uses /* (bare) or /*rest (named) for catch-all routes.
 * Keeping the raw pattern as the view name hides information about which path was actually
 * visited. This function replaces catch-all segments with the corresponding portion of the
 * actual URL path, preserving any parameterized segments that precede it.
 *
 * @example
 * substituteCatchAll("/*", "/foo/bar")           // => "/foo/bar"
 * substituteCatchAll("/*rest", "/foo/bar")        // => "/foo/bar"
 * substituteCatchAll("/org/:orgId/*", "/org/123/some/page") // => "/org/:orgId/some/page"
 */
function substituteCatchAll(viewName: string, pathname: string): string {
  // Match bare /* or named /*rest catch-all at the end of the route
  const catchAllMatch = viewName.match(/^(.*)\/\*[^/]*$/)
  if (!catchAllMatch) {
    return viewName
  }

  const prefix = catchAllMatch[1]

  // Count the number of path segments in the prefix to find the matching point in the actual path
  const prefixSegmentCount = prefix === "" ? 0 : prefix.split("/").length - 1
  const pathSegments = pathname.split("/")
  const suffix = pathSegments.slice(prefixSegmentCount + 1).join("/")

  return prefix + (suffix ? `/${suffix}` : "") || "/"
}
