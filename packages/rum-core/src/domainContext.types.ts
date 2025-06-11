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

/**
 * Additional information available when the SDK dispatches a RUM **View** event.
 */
export interface RumViewEventDomainContext {
  location: Readonly<Location>
}

/**
 * Additional information available when the SDK dispatches a RUM **Action** event.
 */
export interface RumActionEventDomainContext {
  events?: Event[]
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches a **Fetch** resource event.
 */
export interface RumFetchResourceEventDomainContext {
  requestInit?: RequestInit
  requestInput: RequestInfo
  response?: Response
  error?: Error
  performanceEntry?: PerformanceEntry
  isAborted: boolean
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches an **XHR** resource event.
 */
export interface RumXhrResourceEventDomainContext {
  xhr: XMLHttpRequest
  performanceEntry?: PerformanceEntry
  isAborted: boolean
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches a **Resource** event that is neither fetch nor XHR.
 */
export interface RumOtherResourceEventDomainContext {
  performanceEntry: PerformanceEntry
}

/**
 * Additional information available when the SDK dispatches an **Error** event.
 */
export interface RumErrorEventDomainContext {
  error: unknown
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches a **Long Task** event.
 */
export interface RumLongTaskEventDomainContext {
  performanceEntry: PerformanceEntry
}

/**
 * Additional information available when the SDK dispatches a **Vital** event.
 */
export type RumVitalEventDomainContext = Record<string, never>
