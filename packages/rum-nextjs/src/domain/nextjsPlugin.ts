import { buildUrl } from '@datadog/browser-core'
import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

export type NextjsPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'onRumStart'>

type InitSubscriber = (rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addEvent: StartRumResult['addEvent']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddEvent: StartRumResult['addEvent'] | undefined
let lastNavigationUrl: string | undefined

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

export function nextjsPlugin(): NextjsPlugin {
  return {
    name: 'nextjs',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      initConfiguration.trackViewsManually = true

      for (const subscriber of onRumInitSubscribers) {
        subscriber(publicApi)
      }
    },
    onRumStart({ addEvent }) {
      globalAddEvent = addEvent
      if (addEvent) {
        for (const subscriber of onRumStartSubscribers) {
          subscriber(addEvent)
        }
      }
    },
  } satisfies RumPlugin
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
  if (globalAddEvent) {
    callback(globalAddEvent)
  } else {
    onRumStartSubscribers.push(callback)
  }
}

export function resetNextjsPlugin() {
  globalPublicApi = undefined
  globalAddEvent = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
  lastNavigationUrl = undefined
}
