import type { Configuration } from '../domain/configuration'
import { DOM_EVENT, addEventListener } from './addEventListener'

export function runOnReadyState(
  configuration: Configuration,
  expectedReadyState: 'complete' | 'interactive',
  callback: () => void
) {
  if (document.readyState === expectedReadyState || document.readyState === 'complete') {
    callback()
  } else {
    const eventName = expectedReadyState === 'complete' ? DOM_EVENT.LOAD : DOM_EVENT.DOM_CONTENT_LOADED
    addEventListener(configuration, window, eventName, callback, { once: true })
  }
}
