import type { RumPerformanceNavigationTiming } from '@datadog/browser-rum-core/src/browser/performanceObservable'

export type UrlEvent = {
  type: 'url'
  url: string
}

export type NavigationTimingsEvent = {
  type: 'navigation_timings'
} & Omit<RumPerformanceNavigationTiming, 'toJSON'>

export type Event = UrlEvent | NavigationTimingsEvent
