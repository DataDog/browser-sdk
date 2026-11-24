import { AbstractLifeCycle } from '@datadog/browser-core'
import type { Context } from '@datadog/js-core/util'
import type { LogsEvent } from '../logsEvent.types'
import type { CommonContext, RawLogsEvent } from '../rawLogsEvent.types'
import type { LogsEventDomainContext } from '../domainContext.types'

export const enum LifeCycleEventType {
  RAW_LOG_COLLECTED,
  LOG_COLLECTED,
}

// Workaround for `isolatedModules: true` projects: the const enum can't be used directly as an
// EventMap key in the emitted declarations (TS2748). `declare` keeps it typecheck-only, so the
// bundle doesn't change. Same as in rum-core, see
// https://github.com/DataDog/browser-sdk/issues/2208 and
// https://github.com/microsoft/TypeScript/issues/54152
declare const LifeCycleEventTypeAsConst: {
  RAW_LOG_COLLECTED: LifeCycleEventType.RAW_LOG_COLLECTED
  LOG_COLLECTED: LifeCycleEventType.LOG_COLLECTED
}

// Exported, else TS fails to build the package with error TS4058
export interface LifeCycleEventMap {
  [LifeCycleEventTypeAsConst.RAW_LOG_COLLECTED]: RawLogsEventCollectedData
  [LifeCycleEventTypeAsConst.LOG_COLLECTED]: LogsEvent & Context
}

export const LifeCycle = AbstractLifeCycle<LifeCycleEventMap>
export type LifeCycle = AbstractLifeCycle<LifeCycleEventMap>

export interface RawLogsEventCollectedData<E extends RawLogsEvent = RawLogsEvent> {
  rawLogsEvent: E
  savedCommonContext?: CommonContext
  domainContext?: LogsEventDomainContext<E['origin']>
  loggerTags?: string[]
}
