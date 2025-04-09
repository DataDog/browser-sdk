import type {
  RumPerformanceEventTiming,
  RumPerformanceNavigationTiming,
  RumPerformanceResourceTiming,
} from '@datadog/browser-rum-core/src/browser/performanceObservable'

export type UrlEvent = {
  type: EVENT.URL
  url: string
}

export type PerformanceNavigationTimingsEvent = {
  type: EVENT.NAVIGATION_TIMING
} & Omit<RumPerformanceNavigationTiming, 'toJSON'>

export type PerformanceResourceTimingsEvent = {
  type: EVENT.RESOURCE_TIMING
} & Omit<RumPerformanceResourceTiming, 'toJSON'>

export type PerformanceEventTimingsEvent = {
  type: EVENT.EVENT_TIMING
} & Omit<RumPerformanceEventTiming, 'toJSON'>

export type Event =
  | UrlEvent
  | PerformanceNavigationTimingsEvent
  | PerformanceResourceTimingsEvent
  | PerformanceEventTimingsEvent

export const enum EVENT {
  URL = 'url',
  NAVIGATION_TIMING = 'navigation_timing',
  RESOURCE_TIMING = 'resource_timing',
  EVENT_TIMING = 'event_timing',
}
