import { useRef } from 'react'
import { matchRoutes, useLocation, useRoutes as originalUseRoutes } from 'react-router-dom'
import { startReactRouterView } from './startReactRouterView'

export const useRoutes: typeof originalUseRoutes = (routes, locationArg) => {
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

  return originalUseRoutes(routes, locationArg)
}
