import { ConsoleApiName } from '@datadog/js-core/util'
import type { Observable, BufferedObservable } from '@datadog/js-core/util'
import { monitorError } from '@datadog/js-core/monitor'
import type { FetchContext } from '../browser/fetchObservable'
import { initFetchObservable } from '../browser/fetchObservable'
import type { XhrContext } from '../browser/xhrObservable'
import { initXhrObservable } from '../browser/xhrObservable'
import type { RuntimeError } from './error/trackRuntimeError'
import type { ConsoleLog } from './console/consoleObservable'
import { initConsoleObservable } from './console/consoleObservable'

export const enum BufferedDataType {
  RUNTIME_ERROR,
  FETCH,
  XHR,
  CONSOLE,
}

export type BufferedData =
  | { type: BufferedDataType.RUNTIME_ERROR; data: RuntimeError }
  | { type: BufferedDataType.FETCH; data: FetchContext }
  | { type: BufferedDataType.XHR; data: XhrContext }
  | { type: BufferedDataType.CONSOLE; data: ConsoleLog }

/** Supplies runtime errors and any additional data collected before SDK initialization. */
export interface BufferedDataSource {
  /** Must include RUNTIME_ERROR. The SDK starts any other collectors omitted by this source. */
  types: readonly BufferedDataType[]
  observable: BufferedObservable<BufferedData>
  /** Attaches a collector once and owns its cleanup; the factory is only called for missing types. */
  subscribe<T extends BufferedDataType>(
    type: T,
    createSource: () => Observable<Extract<BufferedData, { type: T }>['data']>
  ): void
  connect?: (onMonitorError: (error: unknown) => void) => void
  stop: () => void
}

export function startBufferingData(bufferedDataSource: BufferedDataSource) {
  bufferedDataSource.connect?.(monitorError)
  bufferedDataSource.subscribe(BufferedDataType.FETCH, initFetchObservable)
  bufferedDataSource.subscribe(BufferedDataType.XHR, initXhrObservable)
  bufferedDataSource.subscribe(BufferedDataType.CONSOLE, () => initConsoleObservable(Object.values(ConsoleApiName)))
  return bufferedDataSource
}
