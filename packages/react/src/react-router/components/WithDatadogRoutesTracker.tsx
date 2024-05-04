import React from 'react'
import { useLocation, createRoutesFromChildren, matchRoutes } from 'react-router-dom'
import { DatadogContext } from '../../lib/datadogContext'
import { _computeViewName } from '../../lib/_computeViewName'

export const WithDatadogRoutesTracker =
  (Component: React.ComponentType) =>
  (props: { computeViewName?: typeof _computeViewName; children?: React.ReactNode } = {}) => {
    const { computeViewName = _computeViewName, children } = props
    const location = useLocation()
    const { datadogBrowserSdk } = React.useContext(DatadogContext)

    React.useEffect(() => {
      if (datadogBrowserSdk === undefined) {
        return
      }
      const routes = createRoutesFromChildren(children)

      const routeMatches = matchRoutes(routes, location.pathname)

      // eslint-disable-next-line
      const viewName = computeViewName(routeMatches as any)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      datadogBrowserSdk.startView(viewName)
    }, [location])

    // @ts-ignore TODO: fix this
    return <Component {...props}>{children}</Component>
  }
