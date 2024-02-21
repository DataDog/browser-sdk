import { datadogRum } from '@datadog/browser-rum'
import type { RumInitConfiguration } from '@datadog/browser-rum'
import { _computeViewName } from '../lib/_computeViewName'
import type { RouteMatch, Router, RouterState } from './types'

export const createDatadogReactRouter = <T extends Router>(
  router: T,
  computeViewName: (routeMatches: RouteMatch[]) => string = _computeViewName
) => {
  router.subscribe((state: RouterState) => {
    const viewName = computeViewName(state.matches)
    datadogRum.startView(viewName)
  })
  return router
}

export const datadogReactRum = Object.assign({}, datadogRum, {
  init: (config: Omit<RumInitConfiguration, 'trackViewsManually'>) =>
    datadogRum.init(
      Object.assign(config, {
        trackViewsManually: true,
      })
    ),
})

export { WithDatadogRoutesTracker } from '../components/WithDatadogRoutesTracker'
export { DatadogProvider } from '../components/DatadogProvider'
export { useRoutesWithTracker } from '../hooks/useRoutesWithTracker'
export { DatadogErrorTracker } from '../components/DatadogErrorTracker'
