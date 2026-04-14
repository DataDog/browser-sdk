import type { RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

export type InitSubscriber = (rumPublicApi: RumPublicApi) => void
export type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddError: StartRumResult['addError'] | undefined

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

export function setRumPublicApi(publicApi: RumPublicApi) {
  globalPublicApi = publicApi
  for (const subscriber of onRumInitSubscribers) {
    subscriber(publicApi)
  }
}

export function setRumAddError(addError: StartRumResult['addError']) {
  globalAddError = addError
  for (const subscriber of onRumStartSubscribers) {
    subscriber(addError)
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

export function resetNuxtPlugin() {
  globalPublicApi = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
