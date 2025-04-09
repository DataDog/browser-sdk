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

export type Event =
  | UrlEvent
  | PerformanceNavigationTimingsEvent
  | PerformanceResourceTimingsEvent
  | PerformanceEventTimingsEvent

export const enum EVENT {
  URL = 'url',
  NAVIGATION_TIMING = 'navigationTiming',
  RESOURCE_TIMING = 'resourceTiming',
  EVENT_TIMING = 'eventTiming',
}
