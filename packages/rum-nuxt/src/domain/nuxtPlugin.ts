import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

type InitSubscriber = (rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddError: StartRumResult['addError'] | undefined

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

export type NuxtPlugin = Required<RumPlugin>

export function nuxtRumPlugin(): NuxtPlugin {
  return {
    name: 'nuxt',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      initConfiguration.trackViewsManually = true

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
      return { router: true, nuxt: true }
    },
  } satisfies RumPlugin
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

export function resetNuxtPlugin() {
  globalPublicApi = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
