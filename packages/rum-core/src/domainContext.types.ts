/**
 * Keep these types in a separate file in order to reference it from the official doc
 */

import type { RumEventType } from './rawRumEvent.types'

export type RumEventDomainContext<T extends RumEventType = any> = T extends RumEventType.VIEW
  ? RumViewEventDomainContext
  : T extends RumEventType.ACTION
    ? RumActionEventDomainContext
    : T extends RumEventType.RESOURCE
      ? RumFetchResourceEventDomainContext | RumXhrResourceEventDomainContext | RumOtherResourceEventDomainContext
      : T extends RumEventType.ERROR
        ? RumErrorEventDomainContext
        : T extends RumEventType.LONG_TASK
          ? RumLongTaskEventDomainContext
          : T extends RumEventType.VITAL
            ? RumVitalEventDomainContext
            : never

export interface RumViewEventDomainContext {
  location: Readonly<Location>
}

export interface RumActionEventDomainContext {
  events?: Event[]
  handlingStack?: string
}

export interface RumFetchResourceEventDomainContext {
  requestInit?: RequestInit
  requestInput: RequestInfo
  response?: Response
  error?: Error
  performanceEntry?: PerformanceEntry
  isAborted: boolean
  handlingStack?: string
}

export interface RumXhrResourceEventDomainContext {
  xhr: XMLHttpRequest
  performanceEntry?: PerformanceEntry
  isAborted: boolean
  handlingStack?: string
}

export interface RumOtherResourceEventDomainContext {
  performanceEntry: PerformanceEntry
}

export interface RumErrorEventDomainContext {
  error: unknown
  handlingStack?: string
}

export interface RumLongTaskEventDomainContext {
  performanceEntry: PerformanceEntry
}

export interface RumVitalEventDomainContext {}
