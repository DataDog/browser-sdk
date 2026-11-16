import { ConsoleApiName, mockable, BufferedObservable } from '@datadog/js-core/util'
import type { Observable, Subscription } from '@datadog/js-core/util'
import type { FetchContext } from '../browser/fetchObservable'
import { initFetchObservable } from '../browser/fetchObservable'
import type { XhrContext } from '../browser/xhrObservable'
import { initXhrObservable } from '../browser/xhrObservable'
import { addTelemetryDebug } from './telemetry'
import type { RawError } from './error/error.types'
import { trackRuntimeError } from './error/trackRuntimeError'
import type { ConsoleLog } from './console/consoleObservable'
import { initConsoleObservable } from './console/consoleObservable'

const BUFFER_LIMIT = 500

export const enum BufferedDataType {
  RUNTIME_ERROR,
  FETCH,
  XHR,
  CONSOLE,
}

export type BufferedData =
  | { type: BufferedDataType.RUNTIME_ERROR; data: RawError }
  | { type: BufferedDataType.FETCH; data: FetchContext }
  | { type: BufferedDataType.XHR; data: XhrContext }
  | { type: BufferedDataType.CONSOLE; data: ConsoleLog }

/**
 * Starts collecting early data (runtime errors, fetch, XHR and console calls) and buffers it until
 * the product subscribes to the returned observable and unbuffers it.
 *
 * @param consoleApis - Console APIs to instrument. Only instrument APIs the product may collect, as
 * each instrumented call serializes its parameters.
 */
export function startBufferingData(consoleApis: ConsoleApiName[] = Object.values(ConsoleApiName)) {
  const observable = new BufferedObservable<BufferedData>(BUFFER_LIMIT, (count) => {
    // monitor-until: 2026-10-14
    addTelemetryDebug('Early data collection dropped data on unbuffer', {
      count,
    })
  })

  function subscribe<T extends BufferedDataType>(
    type: T,
    source: Observable<Extract<BufferedData, { type: T }>['data']>
  ) {
    return source.subscribe((data) => {
      observable.notify({ type, data } as BufferedData)
    })
  }

  const subscriptions: Subscription[] = [
    subscribe(BufferedDataType.RUNTIME_ERROR, mockable(trackRuntimeError)()),
    subscribe(BufferedDataType.FETCH, initFetchObservable()),
    subscribe(BufferedDataType.XHR, initXhrObservable()),
  ]

  const consoleSubscriptions = new Map<ConsoleApiName, Subscription>()
  consoleApis.forEach((api) => {
    consoleSubscriptions.set(api, subscribe(BufferedDataType.CONSOLE, initConsoleObservable([api])))
  })

  return {
    observable,

    /**
     * Stops instrumenting the console APIs that are not part of `apis`, once the product knows which
     * ones it collects.
     */
    restrictConsoleApis: (apis: ConsoleApiName[]) => {
      consoleSubscriptions.forEach((subscription, api) => {
        if (!apis.includes(api)) {
          subscription.unsubscribe()
          consoleSubscriptions.delete(api)
        }
      })
    },

    stop: () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe())
      consoleSubscriptions.forEach((subscription) => subscription.unsubscribe())
      consoleSubscriptions.clear()
    },
  }
}
