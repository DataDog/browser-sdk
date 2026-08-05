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
let lastNavigationUrl: string | undefined
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

export function startNextjsView(viewName: string) {
  if (globalPublicApi) {
    // Use the URL captured by onRouterTransitionStart if available, since React renders before pushState updates window.location
    const url = lastNavigationUrl ? buildUrl(lastNavigationUrl, window.location.origin).href : undefined
    lastNavigationUrl = undefined
    globalPublicApi.startView({ name: viewName, url })
  }
}

// Must be re-exported from the user's instrumentation-client.ts so we can capture the URL before React renders
export function onRouterTransitionStart(url: string) {
  lastNavigationUrl = url
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
  lastNavigationUrl = undefined
  routerType = undefined
}
