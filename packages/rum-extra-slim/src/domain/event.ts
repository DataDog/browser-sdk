import type { ContextValue } from '@datadog/browser-core'
import type {
  RumPerformanceEventTiming,
  RumPerformanceNavigationTiming,
  RumPerformanceResourceTiming,
} from '@datadog/browser-rum-core/src/browser/performanceObservable'

export type UrlEvent = {
  type: EVENT.URL
  url: string
}

export type ErrorEvent = {
  type: EVENT.ERROR
  error?: {
    stack?: string
    message?: string
    handlingStack?: string
    fingerprint?: ContextValue
    context?: ContextValue
  }
}

export type UncaughtErrorEvent = {
  type: EVENT.UNCAUGHT_ERROR
  message?: string | Event
  source?: string
  lineno?: number
  colno?: number
  error?: ErrorEvent['error']
}

export type PerformanceNavigationTimingsEvent = {
  type: EVENT.NAVIGATION_TIMING
  entry: Omit<RumPerformanceNavigationTiming, 'toJSON'>
}

export type PerformanceResourceTimingsEvent = {
  type: EVENT.RESOURCE_TIMING
  entry: Omit<RumPerformanceResourceTiming, 'toJSON'>
}

export type PerformanceEventTimingsEvent = {
  type: EVENT.EVENT_TIMING
  entry: Omit<RumPerformanceEventTiming, 'toJSON'>
}

export type BrowserEvent =
  | UrlEvent
  | ErrorEvent
  | UncaughtErrorEvent
  | PerformanceNavigationTimingsEvent
  | PerformanceResourceTimingsEvent
  | PerformanceEventTimingsEvent

export const enum EVENT {
  URL = 'url',
  UNCAUGHT_ERROR = 'uncaughtError',
  ERROR = 'error',
  NAVIGATION_TIMING = 'navigationTiming',
  RESOURCE_TIMING = 'resourceTiming',
  EVENT_TIMING = 'eventTiming',
}
