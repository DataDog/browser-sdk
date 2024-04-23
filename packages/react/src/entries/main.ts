import { datadogRum } from '@datadog/browser-rum'
import { _computeViewName } from '../lib/_computeViewName'
import type { RouteMatch, Router, RouterState } from './types'

export const createDatadogReactRouter = <T extends Router>(
  router: T,
  computeViewName: (routeMatches: RouteMatch[]) => string = _computeViewName
) => {
  router.subscribe((state: RouterState) => {
    const internalContext = datadogRum.getInternalContext()
    const viewName = computeViewName(state.matches)
    if (internalContext?.view?.name === viewName) {
      return
    }
    datadogRum.startView(viewName)
  })
  return router
}

export const datadogReactRum = datadogRum
export { WithDatadogRoutesTracker } from '../react-router/components/WithDatadogRoutesTracker'
export { DatadogProvider } from '../components/DatadogProvider'
export { useRoutesWithTracker } from '../react-router/hooks/useRoutesWithTracker'
export { DatadogErrorTracker } from '../error-tracking/components/DatadogErrorTracker'
export { WithDatadogRecorder } from '../performance/WithDatadogRecorder'
export { ReactRecorder } from '../performance/ReactRecorder'
