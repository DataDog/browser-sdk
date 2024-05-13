import { AbstractLifeCycle } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import type { CommonContext, RawLogsEvent } from '../rawLogsEvent.types'
import type { LogsEventDomainContext } from '../domainContext.types'

export const enum LifeCycleEventType {
  RAW_LOG_COLLECTED,
  LOG_COLLECTED,
}

interface LifeCycleEventMap {
  [LifeCycleEventType.RAW_LOG_COLLECTED]: RawLogsEventCollectedData
  [LifeCycleEventType.LOG_COLLECTED]: LogsEvent & Context
}

export const LifeCycle = AbstractLifeCycle<LifeCycleEventMap>
export type LifeCycle = AbstractLifeCycle<LifeCycleEventMap>

export interface RawLogsEventCollectedData<E extends RawLogsEvent = RawLogsEvent> {
  rawLogsEvent: E
  messageContext?: object
  savedCommonContext?: CommonContext
  domainContext?: LogsEventDomainContext<E['origin']>
}
