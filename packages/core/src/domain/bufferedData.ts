import type { Observable, Subscription } from '../tools/observable'
import { BufferedObservable } from '../tools/observable'
import { mockable } from '../tools/mockable'
import type { FetchContext } from '../browser/fetchObservable'
import { initFetchObservable } from '../browser/fetchObservable'
import type { XhrContext } from '../browser/xhrObservable'
import { initXhrObservable } from '../browser/xhrObservable'
import { ConsoleApiName } from '../tools/display'
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

export function startBufferingData() {
  const observable = new BufferedObservable<BufferedData>(BUFFER_LIMIT)
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

  subscribe(BufferedDataType.RUNTIME_ERROR, mockable(trackRuntimeError)())
  subscribe(BufferedDataType.FETCH, initFetchObservable())
  subscribe(BufferedDataType.XHR, initXhrObservable({ allowUntrustedEvents: true }))
  subscribe(BufferedDataType.CONSOLE, initConsoleObservable(Object.values(ConsoleApiName)))

  return {
    observable,
    stop: () => subscriptions.forEach((subscription) => subscription.unsubscribe()),
  }
}
