import type { Router } from 'vue-router'
import type { RumPlugin, StartRumResult } from '@datadog/browser-rum-core'
import { startTrackingNuxtViews } from './router/nuxtRouter'

type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalAddError: StartRumResult['addError'] | undefined

const onRumStartSubscribers: StartSubscriber[] = []

export type NuxtPlugin = Required<RumPlugin>

export function nuxtRumPlugin(router?: Router): NuxtPlugin {
  return {
    name: 'nuxt',
    onInit({ publicApi, initConfiguration }) {
      initConfiguration.trackViewsManually = true
      if (router) {
        startTrackingNuxtViews(publicApi, router)
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

export function onRumStart(callback: StartSubscriber) {
  if (globalAddError) {
    callback(globalAddError)
  } else {
    onRumStartSubscribers.push(callback)
  }
}

export function resetNuxtPlugin() {
  globalAddError = undefined
  onRumStartSubscribers.length = 0
}
