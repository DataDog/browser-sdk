import type { RumPublicApi } from '@datadog/browser-rum-core'
import { _computeViewName } from '../../lib/_computeViewName'
import type { RouteMatch, Router, RouterState } from '../types'

export const createDatadogReactRouter = <T extends Router>(
  router: T,
  datadogBrowserSdk: RumPublicApi,
  computeViewName: (routeMatches: RouteMatch[]) => string = _computeViewName
) => {
  router.subscribe((state: RouterState) => {
    const internalContext = datadogBrowserSdk.getInternalContext()
    const viewName = computeViewName(state.matches)
    if (internalContext?.view?.name === viewName) {
      return
    }
    datadogBrowserSdk.startView(viewName)
  })
  return router
}
