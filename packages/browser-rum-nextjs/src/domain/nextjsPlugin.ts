import { buildUrl, globalObject } from '@datadog/js-core/util'
import { mockable, toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

export type NextjsPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'onRumStart' | 'getConfigurationTelemetry'>

type NextjsRouterType = 'app-router' | 'pages-router'
type RouterTransitionEvent = { id: string } | null
interface NextjsGlobalObject {
  next?: { version?: string }
}
type InitSubscriber = (rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddError: StartRumResult['addError'] | undefined
let currentViewName: string | undefined
// The pathname and normalized name DatadogAppRouter's effect last actually committed.
// React doesn't rerun that effect when a navigation returns to a pathname it already rendered
// (e.g. a query-only change), so this is reused instead of waiting for a fresh commit.
let committedAppRouterView: { pathname: string; name: string } | undefined
// Last pathname claimed by a router transition, whether or not it has committed yet.
let activeAppRouterPathname: string | undefined
let lastRouterTransitionId: string | undefined
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
        committedAppRouterView = { pathname: window.location.pathname, name: window.location.pathname }
        activeAppRouterPathname = window.location.pathname
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

// The App Router component calls this after React commits the route. A layout effect may have
// started a newer navigation before this passive effect runs, or this render may belong to a route
// that isn't the active one (e.g. a re-render of the previous route while a navigation is pending) —
// either way, only a commit for the currently active pathname is trusted.
export function setNextjsViewName(viewName: string, pathname: string) {
  if (pathname !== activeAppRouterPathname) {
    return
  }

  committedAppRouterView = { pathname, name: viewName }

  if (globalPublicApi && currentViewName !== viewName) {
    currentViewName = viewName
    globalPublicApi.setViewName(viewName)
  }
}

// Must be re-exported from the user's instrumentation-client.ts so we can start the view before React renders
export function onRouterTransitionStart(url: string, _navigationType?: string, event?: RouterTransitionEvent) {
  const navigationUrl = buildUrl(url, window.location.origin)

  if (event && event.id === lastRouterTransitionId) {
    return
  }

  // A different transition ID can target the same active pathname while that pathname has not committed yet.
  // Keep it distinct from a query/hash-only navigation on the committed route.
  const isNewPendingTransition = Boolean(event) && navigationUrl.pathname !== committedAppRouterView?.pathname

  if (
    navigationUrl.origin === window.location.origin &&
    (navigationUrl.pathname !== activeAppRouterPathname || isNewPendingTransition)
  ) {
    lastRouterTransitionId = event?.id
    activeAppRouterPathname = navigationUrl.pathname

    // DatadogAppRouter's effect does not rerun when the pathname is restored, so reuse its normalized name.
    const viewName =
      navigationUrl.pathname === committedAppRouterView?.pathname
        ? committedAppRouterView.name
        : navigationUrl.pathname

    startNextjsView(viewName, navigationUrl.href)
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
  committedAppRouterView = undefined
  activeAppRouterPathname = undefined
  lastRouterTransitionId = undefined
  routerType = undefined
}
