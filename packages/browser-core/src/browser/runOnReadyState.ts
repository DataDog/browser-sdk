import { globalObject, mockable } from '@datadog/js-core/util'
import { noop } from '../tools/utils/functionUtils'
import { DOM_EVENT, addEventListener } from './addEventListener'

export function runOnReadyState(
  expectedReadyState: 'complete' | 'interactive',
  callback: () => void
): { stop: () => void } {
  const document = mockable(globalObject.document)
  if (!document || document.readyState === expectedReadyState || document.readyState === 'complete') {
    callback()
    return { stop: noop }
  }
  const eventName = expectedReadyState === 'complete' ? DOM_EVENT.LOAD : DOM_EVENT.DOM_CONTENT_LOADED
  return addEventListener(window, eventName, callback, { once: true })
}

export function asyncRunOnReadyState(expectedReadyState: 'complete' | 'interactive'): Promise<void> {
  return new Promise((resolve) => {
    runOnReadyState(expectedReadyState, resolve)
  })
}
