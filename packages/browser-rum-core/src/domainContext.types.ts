/**
 * Keep these types in a separate file in order to reference it from the official doc
 */

import type { RumEventType } from './rawRumEvent.types'

export type RumEventDomainContext<T extends RumEventType = any> = T extends typeof RumEventType.VIEW
  ? RumViewEventDomainContext
  : T extends typeof RumEventType.ACTION
    ? RumActionEventDomainContext
    : T extends typeof RumEventType.RESOURCE
      ? RumResourceEventDomainContext | RumManualResourceEventDomainContext | RumWebSocketResourceEventDomainContext
      : T extends typeof RumEventType.ERROR
        ? RumErrorEventDomainContext
        : T extends typeof RumEventType.LONG_TASK
          ? RumLongTaskEventDomainContext
          : T extends typeof RumEventType.VITAL
            ? RumVitalEventDomainContext | RumWebSocketVitalEventDomainContext
            : never

export interface RumViewEventDomainContext {
  location: Readonly<Location>
  handlingStack?: string
}

export interface RumActionEventDomainContext {
  events?: Event[]
  handlingStack?: string
}

export interface RumResourceEventDomainContext {
  isManual: false
  // TODO next major: remove this discriminant along with RumWebSocketResourceEventDomainContext
  /**
   * @deprecated WebSocket connections are no longer reported as resource events, so this is always `false`.
   * It will be removed in the next major version.
   */
  isWebSocket: false
  performanceEntry: PerformanceResourceTiming | PerformanceNavigationTiming
  xhr: XMLHttpRequest | undefined
  isAborted: boolean
  handlingStack: string | undefined
  requestInit: RequestInit | undefined
  requestInput: RequestInfo | undefined
  response: Response | undefined
  error: Error | undefined
}

export interface RumManualResourceEventDomainContext {
  /**
   * Manual resources created via startResource/stopResource do not have
   * a performance entry or request/response objects.
   */
  isManual: true
}

// TODO next major: remove this type. WebSocket resource events are no longer produced, but it was
// exposed to customers who opted in early into betaTrackWebSockets, so removing it would be a breaking change.
/**
 * @deprecated WebSocket connections are no longer reported as resource events, so this context is never
 * produced. It will be removed in the next major version.
 */
export interface RumWebSocketResourceEventDomainContext {
  isManual: false
  isWebSocket: true
  webSocket: WebSocket
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

export interface RumWebSocketVitalEventDomainContext {
  webSocket: WebSocket
}
