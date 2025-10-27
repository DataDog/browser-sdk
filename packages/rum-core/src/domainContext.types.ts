/**
 * Keep these types in a separate file in order to reference it from the official doc
 */

import type { RumEventType } from './rawRumEvent.types'

export type RumEventDomainContext<T extends RumEventType = any> = T extends typeof RumEventType.VIEW
  ? RumViewEventDomainContext
  : T extends typeof RumEventType.ACTION
    ? RumActionEventDomainContext
    : T extends typeof RumEventType.RESOURCE
      ? RumFetchResourceEventDomainContext | RumXhrResourceEventDomainContext | RumOtherResourceEventDomainContext
      : T extends typeof RumEventType.ERROR
        ? RumErrorEventDomainContext
        : T extends typeof RumEventType.LONG_TASK
          ? RumLongTaskEventDomainContext
          : T extends typeof RumEventType.VITAL
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

export interface RumErrorEventDomainContext {
  error: unknown
  handlingStack?: string
}

export interface RumLongTaskEventDomainContext {
  performanceEntry: PerformanceEntry
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RumVitalEventDomainContext {}
