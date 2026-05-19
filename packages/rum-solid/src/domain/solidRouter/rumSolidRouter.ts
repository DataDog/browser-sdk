import { isServer } from 'solid-js/web'
import { createEffect } from 'solid-js'
import { useCurrentMatches, useLocation } from '@solidjs/router'
import { startSolidRouterView } from './startSolidRouterView'

/**
 * Renderless Solid component that tracks route changes as RUM views.
 *
 * Place this component anywhere inside your <Router> tree. It renders nothing
 * but subscribes to route changes via useCurrentMatches() and useLocation(),
 * calling datadogRum.startView() on every navigation.
 *
 * @example
 * ```tsx
 * import { Router } from '@solidjs/router'
 * import { RumSolidRouter } from '@datadog/browser-rum-solid'
 *
 * function App() {
 *   return (
 *     <Router>
 *       <RumSolidRouter />
 *     </Router>
 *   )
 * }
 * ```
 */
export function RumSolidRouter(): null {
  // Guard: do not run any RUM logic during server-side rendering
  if (isServer) {
    return null
  }

  const matches = useCurrentMatches()
  const location = useLocation()

  createEffect(() => {
    // Access location.pathname to make this effect reactive to navigation changes.
    // useCurrentMatches() returns the matched route records after each completed navigation.
    void location.pathname
    startSolidRouterView(matches().map((match) => ({ route: { path: match.route.originalPath } })))
  })

  return null
}
