/**
 * Keep these types in a separate file in order to reference it from the official doc
 */

import type { RumEventType } from './rawRumEvent.types'

/**
 * Additional context data that varies based on the type of RUM event being dispatched.
 */
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
  /**
   * The browser location object at the time the view was created.
   */
  location: Readonly<Location>
}

/**
 * Additional information available when the SDK dispatches a RUM **Action** event.
 */
export interface RumActionEventDomainContext {
  /**
   * DOM events that triggered this action.
   */
  events?: Event[]
  /**
   * Stack trace of where the action was handled by the SDK.
   */
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches a **Fetch** resource event.
 */
export interface RumFetchResourceEventDomainContext {
  /**
   * Init object passed to the fetch call.
   */
  requestInit?: RequestInit
  /**
   * Input parameter passed to the fetch call.
   */
  requestInput: RequestInfo
  /**
   * Response object returned by the fetch call.
   */
  response?: Response
  /**
   * Error that occurred during the fetch call.
   */
  error?: Error
  /**
   * Browser performance entry for this resource.
   */
  performanceEntry?: PerformanceEntry
  /**
   * Whether the fetch call was aborted.
   */
  isAborted: boolean
  /**
   * Stack trace of where the resource was handled by the SDK.
   */
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches an **XHR** resource event.
 */
export interface RumXhrResourceEventDomainContext {
  /**
   * The XMLHttpRequest object that made the request.
   */
  xhr: XMLHttpRequest
  /**
   * Browser performance entry for this resource.
   */
  performanceEntry?: PerformanceEntry
  /**
   * Whether the XHR request was aborted.
   */
  isAborted: boolean
  /**
   * Stack trace of where the resource was handled by the SDK.
   */
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches a **Resource** event that is neither fetch nor XHR.
 */
export interface RumOtherResourceEventDomainContext {
  /**
   * Browser performance entry for this resource.
   */
  performanceEntry: PerformanceEntry
}

/**
 * Additional information available when the SDK dispatches an **Error** event.
 */
export interface RumErrorEventDomainContext {
  /**
   * The original error object that was captured.
   */
  error: unknown
  /**
   * Stack trace of where the error was handled by the SDK.
   */
  handlingStack?: string
}

/**
 * Additional information available when the SDK dispatches a **Long Task** event.
 */
export interface RumLongTaskEventDomainContext {
  /**
   * Browser performance entry for this long task.
   */
  performanceEntry: PerformanceEntry
}

/**
 * Additional information available when the SDK dispatches a **Vital** event.
 */
export type RumVitalEventDomainContext = Record<string, never>
