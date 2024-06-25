import {
  createBrowserRouter as originalCreateBrowserRouter,
  createHashRouter as originalCreateHashRouter,
  createMemoryRouter as originalCreateMemoryRouter,
} from 'react-router-dom'
import { startReactRouterView } from './startReactRouterView'

type Router = ReturnType<typeof originalCreateBrowserRouter>

export const createBrowserRouter: typeof originalCreateBrowserRouter = (routes, options) =>
  registerRouter(originalCreateBrowserRouter(routes, options))
export const createHashRouter: typeof originalCreateHashRouter = (routes, options) =>
  registerRouter(originalCreateHashRouter(routes, options))
export const createMemoryRouter: typeof originalCreateMemoryRouter = (routes, options) =>
  registerRouter(originalCreateMemoryRouter(routes, options))

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
  return router
}
