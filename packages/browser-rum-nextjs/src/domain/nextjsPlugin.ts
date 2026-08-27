import { buildUrl } from '@datadog/js-core/util'
import { globalObject, mockable, toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

export type NextjsPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'onRumStart' | 'getConfigurationTelemetry'>

type NextjsRouterType = 'app-router' | 'pages-router'
interface NextjsGlobalObject {
  next?: { version?: string }
}
type InitSubscriber = (rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddError: StartRumResult['addError'] | undefined
let currentViewName: string | undefined
let currentAppRouterPathname: string | undefined
let routerType: NextjsRouterType | undefined

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

export function nextjsPlugin(): NextjsPlugin {
  return {
    name: 'nextjs',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      initConfiguration.trackViewsManually = true
      routerType = mockable(detectNextjsRouterType)()

      if (routerType === 'app-router') {
        currentAppRouterPathname = window.location.pathname
        startNextjsView(window.location.pathname, window.location.href)
      }

      for (const subscriber of onRumInitSubscribers) {
        subscriber(publicApi)
      }
    },
    onRumStart({ addError }) {
      globalAddError = addError
      if (addError) {
        for (const subscriber of onRumStartSubscribers) {
          subscriber(addError)
        }
      }
    },
    getConfigurationTelemetry() {
      const nextjsVersion = (globalObject as NextjsGlobalObject).next?.version
      return {
        router: true,
        integrations: toIntegrations(nextjsVersion && toMajorVersionIntegration('nextjs', nextjsVersion), routerType),
      }
    },
  } satisfies RumPlugin
}

// The App Router doesn't hydrate from a `__NEXT_DATA__` payload (it streams RSC data instead),
// so its absence is used as a best-effort signal that the app router is in use.
function detectNextjsRouterType(): NextjsRouterType {
  return document.getElementById('__NEXT_DATA__') ? 'pages-router' : 'app-router'
}

export function startNextjsView(viewName: string, url?: string) {
  if (globalPublicApi) {
    currentViewName = viewName
    globalPublicApi.startView({ name: viewName, url })
  }
}

export function setNextjsViewName(viewName: string, pathname?: string) {
  // The App Router component calls this after the route has committed.
  currentAppRouterPathname = pathname ?? currentAppRouterPathname

  if (globalPublicApi && currentViewName !== viewName) {
    currentViewName = viewName
    globalPublicApi.setViewName(viewName)
  }
}

// Must be re-exported from the user's instrumentation-client.ts so we can start the view before React renders
export function onRouterTransitionStart(url: string) {
  const navigationUrl = buildUrl(url, window.location.origin)

  // Compare with the last committed pathname because window.location can already contain the target pathname
  // when this callback runs.
  if (navigationUrl.origin === window.location.origin && navigationUrl.pathname !== currentAppRouterPathname) {
    startNextjsView(navigationUrl.pathname, navigationUrl.href)
  }
}

export function onRumInit(callback: InitSubscriber) {
  if (globalPublicApi) {
    callback(globalPublicApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function onRumStart(callback: StartSubscriber) {
  if (globalAddError) {
    callback(globalAddError)
  } else {
    onRumStartSubscribers.push(callback)
  }
}

export function resetNextjsPlugin() {
  globalPublicApi = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
  currentViewName = undefined
  currentAppRouterPathname = undefined
  routerType = undefined
}
