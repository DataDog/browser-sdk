import { startReactRouterView } from './startReactRouterView'
import type { AnyCreateRouter } from './types'

export function wrapCreateRouter<CreateRouter extends AnyCreateRouter<any>>(
  originalCreateRouter: CreateRouter
): CreateRouter {
  return ((routes, options) => {
    const router = originalCreateRouter(routes, options)
    let location = router.state.location.pathname

    // We subscribe before RouterProvider, so initial loader-error notifications
    // reach us instead of it (consuming the react-router ≥7.15.1 one-shot buffer,
    // or arriving before RouterProvider's deferred useLayoutEffect). Forward the
    // first such notification to the next subscriber so RouterProvider's onError
    // still fires.
    let hasForwardedInitialErrors = false

    router.subscribe((routerState, opts) => {
      if (opts?.newErrors && !hasForwardedInitialErrors) {
        hasForwardedInitialErrors = true
        const capturedState = routerState
        const capturedOpts = opts
        const originalSubscribe = router.subscribe.bind(router)
        router.subscribe = (fn) => {
          router.subscribe = originalSubscribe
          const unsubscribe = originalSubscribe(fn)
          fn(capturedState, capturedOpts)
          return unsubscribe
        }
      }
      const newPathname = routerState.location.pathname
      if (location !== newPathname) {
        startReactRouterView(routerState.matches)
        location = newPathname
      }
    })
    startReactRouterView(router.state.matches)
    return router
  }) as CreateRouter
}
