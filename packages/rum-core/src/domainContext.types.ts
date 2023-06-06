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
  : never

export interface RumViewEventDomainContext {
  location: Readonly<Location>
}

export interface RumActionEventDomainContext {
  events?: Event[]
}

export interface RumFetchResourceEventDomainContext {
  requestInit?: RequestInit
  requestInput: RequestInfo
  response?: Response
  error?: Error
  performanceEntry?: PerformanceEntryRepresentation
}

export interface RumXhrResourceEventDomainContext {
  xhr: XMLHttpRequest
  performanceEntry?: PerformanceEntryRepresentation
}

export interface RumOtherResourceEventDomainContext {
  performanceEntry: PerformanceEntryRepresentation
}

export interface RumErrorEventDomainContext {
  error: unknown
}

export interface RumLongTaskEventDomainContext {
  performanceEntry: PerformanceEntryRepresentation
}

/**
 * Symbolizes the type of the value returned by performanceEntry.toJSON(). Can also be built
 * manually to represent other kind of performance entries (ex: initial_document) or polyfilled
 * based on `performance.timing`.
 */
export type PerformanceEntryRepresentation = Omit<PerformanceEntry, 'toJSON'>
