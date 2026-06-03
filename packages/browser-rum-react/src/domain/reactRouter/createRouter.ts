import { startReactRouterView } from './startReactRouterView'
import type { AnyCreateRouter, AnyRouterSubscriberOpts } from './types'

export function wrapCreateRouter<CreateRouter extends AnyCreateRouter<any>>(
  originalCreateRouter: CreateRouter
): CreateRouter {
  return ((routes, options) => {
    const router = originalCreateRouter(routes, options)
    let location = router.state.location.pathname

    // We subscribe before RouterProvider, so initial loader-error notifications
    // reach us instead of it — either via react-router ≥7.15.1's one-shot
    // buffer replay (sync) or as a regular broadcast before RouterProvider's
    // deferred useLayoutEffect (async). Capture any such error and replay it
    // to the next subscriber so RouterProvider's onError still fires.
    // The next-subscriber patch is installed eagerly so a single flag
    // (hasNextSubscriberAttached) reliably tells us whether an incoming error
    // is pre- or post-RouterProvider — only pre-RouterProvider errors are
    // captured, avoiding duplicate onError on later resubscribes.
    let pendingInitialError: { state: typeof router.state; opts: AnyRouterSubscriberOpts } | null = null
    let hasNextSubscriberAttached = false

    router.subscribe((routerState, opts) => {
      if (opts?.newErrors && !hasNextSubscriberAttached) {
        pendingInitialError = { state: routerState, opts }
      }
      const newPathname = routerState.location.pathname
      if (location !== newPathname) {
        startReactRouterView(routerState.matches)
        location = newPathname
      }
    })

    const originalSubscribe = router.subscribe.bind(router)
    router.subscribe = (fn) => {
      hasNextSubscriberAttached = true
      router.subscribe = originalSubscribe
      const unsubscribe = originalSubscribe(fn)
      if (pendingInitialError) {
        fn(pendingInitialError.state, pendingInitialError.opts)
        pendingInitialError = null
      }
      return unsubscribe
    }

    startReactRouterView(router.state.matches)
    return router
  }) as CreateRouter
}
