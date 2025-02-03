import { useRef } from 'react'
import { startReactRouterView } from './startReactRouterView'
import type { AnyUseRoute, AnyRouteObject, AnyRouteMatch } from './types'

export function wrapUseRoutes<T extends AnyUseRoute<any>>({
  useRoutes,
  useLocation,
  matchRoutes,
}: {
  useRoutes: T
  useLocation: () => { pathname: string }
  matchRoutes: (routes: AnyRouteObject[], pathname: string) => AnyRouteMatch[] | null
}): T {
  return ((routes, locationArg) => {
    const location = useLocation()
    const pathname = typeof locationArg === 'string' ? locationArg : locationArg?.pathname || location.pathname
    const pathnameRef = useRef<string | null>(null)

    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname
      const matchedRoutes = matchRoutes(routes, pathname)
      if (matchedRoutes) {
        startReactRouterView(matchedRoutes)
      }
    }

    return useRoutes(routes, locationArg)
  }) as T
}
