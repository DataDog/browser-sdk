import { startTanStackRouterView } from './startTanStackRouterView'
import type { AnyTanStackCreateRouter } from './types'

/**
 * Wraps TanStack Router's `createRouter` to automatically track route changes as RUM views.
 *
 * Subscribes to the `onLoad` event which fires after loaders complete but before rendering.
 * This is the earliest event where route matches are up to date, ensuring rendering-related
 * events (resources, errors) are attributed to the correct view. Only creates a new view
 * when the pathname changes (query param and hash changes are ignored).
 */
export function wrapCreateRouter<CreateRouter extends AnyTanStackCreateRouter>(
  originalCreateRouter: CreateRouter
): CreateRouter {
  return ((options: any) => {
    const router = originalCreateRouter(options)

    // onLoad fires for the initial navigation too, so no explicit initial view call is needed
    router.subscribe('onLoad', (event) => {
      if (!event.pathChanged) {
        return
      }
      startTanStackRouterView(router.state.matches)
    })

    return router
  }) as CreateRouter
}
