import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

export type NextjsPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'onRumStart'>

type InitSubscriber = (rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addEvent: StartRumResult['addEvent']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddEvent: StartRumResult['addEvent'] | undefined

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
      for (const subscriber of onRumStartSubscribers) {
        if (addEvent) {
          subscriber(addEvent)
        }
      }
    },
  } satisfies RumPlugin
}

export function startNextjsView(viewName: string) {
  if (globalPublicApi) {
    globalPublicApi.startView(viewName)
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
}
