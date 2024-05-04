import React from 'react'
import { matchRoutes, useLocation, useRoutes } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { DatadogContext } from '../../lib/datadogContext'
import { _computeViewName } from '../../lib/_computeViewName'

export const useRoutesWithTracker = (
  routes: RouteObject[],
  computeViewName: typeof _computeViewName = _computeViewName
) => {
  const { datadogBrowserSdk } = React.useContext(DatadogContext)
  const location = useLocation()

  React.useEffect(() => {
    if (datadogBrowserSdk === undefined) {
      return
    }

    const routeMatches = matchRoutes(routes, location.pathname)

    // eslint-disable-next-line
    const viewName = computeViewName(routeMatches as any)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    datadogBrowserSdk.startView(viewName)
  }, [location.pathname])

  const element = useRoutes(routes)
  return element
}
