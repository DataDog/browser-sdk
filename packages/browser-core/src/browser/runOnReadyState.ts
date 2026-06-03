import type { Configuration } from '../domain/configuration'
import { noop } from '../tools/utils/functionUtils'
import { DOM_EVENT, addEventListener } from './addEventListener'

export function runOnReadyState(
  configuration: Configuration,
  expectedReadyState: 'complete' | 'interactive',
  callback: () => void
): { stop: () => void } {
  if (document.readyState === expectedReadyState || document.readyState === 'complete') {
    callback()
    return { stop: noop }
  }
  const eventName = expectedReadyState === 'complete' ? DOM_EVENT.LOAD : DOM_EVENT.DOM_CONTENT_LOADED
  return addEventListener(configuration, window, eventName, callback, { once: true })
}

export function asyncRunOnReadyState(
  configuration: Configuration,
  expectedReadyState: 'complete' | 'interactive'
): Promise<void> {
  return new Promise((resolve) => {
    runOnReadyState(configuration, expectedReadyState, resolve)
  })
}
