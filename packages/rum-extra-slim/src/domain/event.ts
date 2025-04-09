import type {
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

export type Event = UrlEvent | PerformanceNavigationTimingsEvent | PerformanceResourceTimingsEvent

export const enum EVENT {
  URL = 'url',
  NAVIGATION_TIMING = 'navigation_timing',
  RESOURCE_TIMING = 'resource_timing',
}
