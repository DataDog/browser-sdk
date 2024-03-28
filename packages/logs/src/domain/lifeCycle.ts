import { AbstractLifeCycle } from '@datadog/browser-core'
import type { Context, ErrorSource } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import type { CommonContext, RawLogsEvent } from '../rawLogsEvent.types'

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

export type LogsEventDomainContext<T extends ErrorSource> = T extends typeof ErrorSource.NETWORK
  ? NetworkLogsEventDomainContext
  : never

type NetworkLogsEventDomainContext = {
  isAborted: boolean
}

export interface RawLogsEventCollectedData<E extends RawLogsEvent = RawLogsEvent> {
  rawLogsEvent: E
  messageContext?: object
  savedCommonContext?: CommonContext
  domainContext?: LogsEventDomainContext<E['origin']>
}
