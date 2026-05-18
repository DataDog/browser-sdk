import { createEffect } from "solid-js"
import { useCurrentMatches, useLocation } from "@solidjs/router"
import { isServer } from "solid-js/web"
import { startSolidRouterView } from "./startSolidRouterView"

/**
 * A renderless SolidJS component that tracks route changes for Datadog RUM.
 *
 * Place this component inside your Router tree (e.g. inside the root layout component).
 * When the route changes, it calls datadogRum.startView() with the matched route pattern.
 *
 * @example
 * import { Router } from "@solidjs/router"
 * import { DatadogSolidRouterTracker } from "@datadog/browser-rum-solidjs/solid-router"
 *
 * function App() {
 *   return (
 *     <Router>
 *       <DatadogSolidRouterTracker />
 *       <Routes />
 *     </Router>
 *   )
 * }
 */
export function DatadogSolidRouterTracker() {
  const matches = useCurrentMatches()
  const location = useLocation()

  createEffect(() => {
    // createEffect does not run during SSR in SolidJS, but we add this guard
    // explicitly for clarity and future-proofing.
    if (isServer) {
      return
    }

    // Access location.pathname to make this effect reactive to path changes.
    // Query string and hash changes do not trigger a new view, consistent with
    // how the SDK automatic view tracking handles them.
    const pathname = location.pathname

    const currentMatches = matches()
    startSolidRouterView(currentMatches, pathname)
  })

  // Renderless component -- returns null
  return null
}
