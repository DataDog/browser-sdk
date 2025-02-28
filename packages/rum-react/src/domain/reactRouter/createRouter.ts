import { startReactRouterView } from './startReactRouterView'
import type { AnyCreateRouter } from './types'

export function wrapCreateRouter<CreateRouter extends AnyCreateRouter<any>>(
  originalCreateRouter: CreateRouter
): CreateRouter {
  return ((routes, options) => {
    const router = originalCreateRouter(routes, options)
    let location = router.state.location.pathname
    router.subscribe((routerState) => {
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
