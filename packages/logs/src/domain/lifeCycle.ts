import { AbstractLifeCycle } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import type { CommonContext, RawLogsEvent } from '../rawLogsEvent.types'

export const enum LifeCycleEventType {
  RAW_LOG_COLLECTED,
  LOG_COLLECTED,
}

// This is a workaround for an issue occurring when the Browser SDK is included in a TypeScript
// project configured with `isolatedModules: true`. Even if the const enum is declared in this
// module, we cannot use it directly to define the EventMap interface keys (TS error: "Cannot access
// ambient const enums when the '--isolatedModules' flag is provided.").
//
// Using a plain enum would fix the issue, but would also add 2KB to the minified bundle. By using
// this workaround, we can keep using a const enum without impacting the bundle size (since it is a
// "declare" statement, it will only be used during typecheck and completely ignored when building
// JavaScript).
//
// See issues:
// * https://github.com/DataDog/browser-sdk/issues/2208
// * https://github.com/microsoft/TypeScript/issues/54152
declare const LifeCycleEventTypeAsConst: {
  RAW_LOG_COLLECTED: LifeCycleEventType.RAW_LOG_COLLECTED
  LOG_COLLECTED: LifeCycleEventType.LOG_COLLECTED
}

interface LifeCycleEventMap {
  [LifeCycleEventTypeAsConst.RAW_LOG_COLLECTED]: RawLogsEventCollectedData
  [LifeCycleEventTypeAsConst.LOG_COLLECTED]: LogsEvent & Context
}

export const LifeCycle = AbstractLifeCycle<LifeCycleEventMap>
export type LifeCycle = AbstractLifeCycle<LifeCycleEventMap>

export function startLogsLifeCycle(): LifeCycle {
  return new LifeCycle()
}

export interface RawLogsEventCollectedData<E extends RawLogsEvent = RawLogsEvent> {
  rawLogsEvent: E
  messageContext?: object
  savedCommonContext?: CommonContext
}
