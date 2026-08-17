import { ConsoleApiName } from '@datadog/js-core/util'
import type { Observable, Subscription } from '../tools/observable'
import { BufferedObservable } from '../tools/observable'
import { mockable } from '../tools/mockable'
import type { FetchContext } from '../browser/fetchObservable'
import { initFetchObservable } from '../browser/fetchObservable'
import type { XhrContext } from '../browser/xhrObservable'
import { initXhrObservable } from '../browser/xhrObservable'
import type { WebSocketContext } from '../browser/webSocketObservable'
import { initWebSocketObservable } from '../browser/webSocketObservable'
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
  WEB_SOCKET,
}

export type BufferedData =
  | { type: BufferedDataType.RUNTIME_ERROR; data: RawError }
  | { type: BufferedDataType.FETCH; data: FetchContext }
  | { type: BufferedDataType.XHR; data: XhrContext }
  | { type: BufferedDataType.CONSOLE; data: ConsoleLog }
  | { type: BufferedDataType.WEB_SOCKET; data: WebSocketContext }

export function startBufferingData(sources?: BufferedDataType[]) {
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
    if (sources && !sources.includes(type)) {
      return
    }
    subscriptions.push(
      source.subscribe((data) => {
        observable.notify({ type, data } as BufferedData)
      })
    )
  }

  subscribe(BufferedDataType.RUNTIME_ERROR, mockable(trackRuntimeError)())
  subscribe(BufferedDataType.FETCH, initFetchObservable())
  subscribe(BufferedDataType.XHR, initXhrObservable())
  subscribe(BufferedDataType.CONSOLE, initConsoleObservable(Object.values(ConsoleApiName)))
  subscribe(BufferedDataType.WEB_SOCKET, initWebSocketObservable())

  return {
    observable,
    stop: () => subscriptions.forEach((subscription) => subscription.unsubscribe()),
  }
}
