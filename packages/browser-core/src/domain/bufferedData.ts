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
import { readEarlyCollection } from './earlyCollection/earlyCollection'

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
 * Starts buffering data (runtime errors, fetch, XHR, console) from bundle
 * evaluation until the SDK is initialized.
 *
 * @param supportsEarlyCollectionTakeover - Whether the SDK takes over the
 * early collection package data at init (see `takeOverEarlyCollection` in
 * `@datadog/browser-rum-core`). When true (and the early collection package
 * is present), its error listeners keep buffering raw errors until init and
 * the runtime error instrumentation is skipped to avoid double-counting: the
 * takeover installs it at init. SDKs that do not support the early collection
 * takeover keep collecting errors from bundle evaluation, whether or not the
 * early collection package is present.
 */
export function startBufferingData(supportsEarlyCollectionTakeover = false) {
  const observable = new BufferedObservable<BufferedData>(BUFFER_LIMIT, (count) => {
    // monitor-until: 2026-10-14
    addTelemetryDebug('Early data collection dropped data on unbuffer', {
      count,
    })
  })
  const subscriptions: Subscription[] = []

  function subscribe<T extends BufferedDataType>(
    type: T,
    source: Observable<Extract<BufferedData, { type: T }>['data']>
  ) {
    subscriptions.push(
      source.subscribe((data) => {
        observable.notify({ type, data } as BufferedData)
      })
    )
  }

  if (!supportsEarlyCollectionTakeover || !readEarlyCollection()) {
    subscribe(BufferedDataType.RUNTIME_ERROR, mockable(trackRuntimeError)())
  }
  subscribe(BufferedDataType.FETCH, initFetchObservable())
  subscribe(BufferedDataType.XHR, initXhrObservable())
  subscribe(BufferedDataType.CONSOLE, initConsoleObservable(Object.values(ConsoleApiName)))

  return {
    observable,
    stop: () => subscriptions.forEach((subscription) => subscription.unsubscribe()),
  }
}
