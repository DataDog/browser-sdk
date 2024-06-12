import type { createBrowserRouter } from 'react-router-dom'
import { startReactRouterView } from './startReactRouterView'

type Router = ReturnType<typeof createBrowserRouter>

export function registerRouter(router: Router) {
  let location = router.state.location.pathname
  router.subscribe((routerState) => {
    const newPathname = routerState.location.pathname
    if (location !== newPathname) {
      startReactRouterView(routerState.matches)
      location = newPathname
    }
  })
  startReactRouterView(router.state.matches)
}
