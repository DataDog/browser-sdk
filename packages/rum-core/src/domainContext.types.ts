/**
 * Keep these types in a separate file in order to reference it from the official doc
 */

import type { RumEventType } from './rawRumEvent.types'

export type RumEventDomainContext<T extends RumEventType = any> = T extends typeof RumEventType.VIEW
  ? RumViewEventDomainContext
  : T extends typeof RumEventType.ACTION
    ? RumActionEventDomainContext
    : T extends typeof RumEventType.RESOURCE
      ?
          | RumFetchResourceEventDomainContext
          | RumXhrResourceEventDomainContext
          | RumOtherResourceEventDomainContext
          | RumManualResourceEventDomainContext
      : T extends typeof RumEventType.ERROR
        ? RumErrorEventDomainContext
        : T extends typeof RumEventType.LONG_TASK
          ? RumLongTaskEventDomainContext
          : T extends typeof RumEventType.VITAL
            ? RumVitalEventDomainContext
            : never

export interface RumViewEventDomainContext {
  location: Readonly<Location>
  handlingStack?: string
}

export interface RumActionEventDomainContext {
  events?: Event[]
  handlingStack?: string
}

export interface RumFetchResourceEventDomainContext {
  requestInit: RequestInit | undefined
  requestInput: RequestInfo
  response: Response | undefined
  error: Error | undefined
  performanceEntry: PerformanceEntry | undefined
  isAborted: boolean
  handlingStack: string | undefined
}

export interface RumXhrResourceEventDomainContext {
  xhr: XMLHttpRequest
  performanceEntry: PerformanceEntry | undefined
  isAborted: boolean
  handlingStack: string | undefined
}

export interface RumOtherResourceEventDomainContext {
  performanceEntry: PerformanceEntry
}

export interface RumManualResourceEventDomainContext {
  /**
   * Manual resources created via startResource/stopResource do not have
   * a performance entry or request/response objects.
   */
  isManual: true
}

export interface RumErrorEventDomainContext {
  error: unknown
  handlingStack?: string
}

export interface RumLongTaskEventDomainContext {
  performanceEntry: PerformanceEntry
}

export interface RumVitalEventDomainContext {
  handlingStack?: string
}
