import { clocksNow } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import { globalObject, Observable, noop } from '@datadog/js-core/util'
import { DOM_EVENT, isEventSupported } from '@datadog/js-core/dom'
import { instrumentMethod } from '../../tools/instrumentMethod'

/** Browser input retained until the SDK processes the error. */
export interface RuntimeError {
  originalError: unknown
  startClocks: ClocksState
  onError?: {
    message: string | Event
    url?: string
    line?: number
    column?: number
  }
}

export type UnhandledErrorCallback = (originalError: unknown, onError?: RuntimeError['onError']) => void

export function trackRuntimeError() {
  return new Observable<RuntimeError>((observer) => {
    const handleRuntimeError: UnhandledErrorCallback = (originalError, onError) => {
      observer.notify({ originalError, onError, startClocks: clocksNow() })
    }
    const { stop: stopInstrumentingOnError } = instrumentOnError(handleRuntimeError)
    const { stop: stopInstrumentingOnUnhandledRejection } = instrumentUnhandledRejection(handleRuntimeError)

    return () => {
      stopInstrumentingOnError()
      stopInstrumentingOnUnhandledRejection()
    }
  })
}

export function instrumentOnError(callback: UnhandledErrorCallback) {
  return instrumentMethod(globalObject, 'onerror', ({ parameters: [message, url, line, column, error] }) => {
    callback(error ?? message, { message, url, line, column })
  })
}

export function instrumentUnhandledRejection(callback: UnhandledErrorCallback) {
  // Salesforce LWS does not support the unhandledrejection event. https://developer.salesforce.com/tools/lws-distortion-viewer
  if (!isEventSupported(globalObject.window, DOM_EVENT.UNHANDLED_REJECTION)) {
    return { stop: noop }
  }

  return instrumentMethod(globalObject, 'onunhandledrejection', ({ parameters: [e] }) => {
    callback(e.reason || 'Empty reason')
  })
}
