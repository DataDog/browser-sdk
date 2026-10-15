import { globalObject, mockable, noop } from '@datadog/js-core/util'
import { DOM_EVENT, addEventListener } from '@datadog/js-core/dom'

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
