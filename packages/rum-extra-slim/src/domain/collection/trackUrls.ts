import type { Configuration } from '@datadog/browser-core'
import { addEventListener, DOM_EVENT, instrumentMethod } from '@datadog/browser-core'
import type { UrlEvent } from '../event'
import type { TransportManager } from '../transportManager'

export function trackInitialUrl(transportManager: TransportManager) {
  const url = window.location.href
  const data: UrlEvent = {
    type: 'url',
    url,
  }

  transportManager.send(data)
}

export function trackUrlChange(transportManager: TransportManager) {
  function onUrlChange() {
    const url = window.location.href
    const data: UrlEvent = {
      type: 'url',
      url,
    }
    transportManager.send(data)
  }

  addEventListener({} as Configuration, window, DOM_EVENT.POP_STATE, onUrlChange)
  addEventListener({} as Configuration, window, DOM_EVENT.HASH_CHANGE, onUrlChange)
  instrumentMethod(window.history, 'pushState', ({ onPostCall }) => onPostCall(onUrlChange))
  instrumentMethod(window.history, 'replaceState', ({ onPostCall }) => onPostCall(onUrlChange))

  // track initial url
  onUrlChange()
}
