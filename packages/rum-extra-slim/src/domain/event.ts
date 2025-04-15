import type { ConsoleApiName, ContextValue } from '@datadog/browser-core'
import type {
  RumPerformanceEventTiming,
  RumPerformanceNavigationTiming,
  RumPerformanceResourceTiming,
  RumPerformanceLongAnimationFrameTiming,
} from '@datadog/browser-rum-core/src/browser/performanceObservable'

export type UrlEvent = {
  type: EVENT.URL
  url: string
}

export type ErrorEvent = {
  type: EVENT.ERROR
  message?: string | Event
  source?: string
  lineno?: number
  colno?: number
  error: {
    name?: string
    stack?: string
    message?: string
    cause?: ErrorEvent['error'] | ContextValue
    handlingStack?: string
    fingerprint?: ContextValue
    context?: ContextValue
  }
}

export type ConsoleEvent = {
  type: EVENT.CONSOLE
  method: ConsoleApiName
  args: ContextValue[]
}

export type ActionEvent = {
  type: EVENT.ACTION
  key: string
  value: ContextValue
}

export type FeatureFlagEvent = {
  type: EVENT.FEATURE_FLAG
  key: string
  value: ContextValue
}

export type ContextEvent = {
  type: EVENT.GLOBAL_CONTEXT | EVENT.VIEW_CONTEXT | EVENT.USER | EVENT.ACCOUNT
  context: ContextValue
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

export type PerformanceLongAnimationFrameTimingEvent = {
  type: EVENT.LONG_ANIMATION_FRAME_TIMING
  entry: Omit<RumPerformanceLongAnimationFrameTiming, 'toJSON'>
}

export type BrowserEvent =
  | UrlEvent
  | ErrorEvent
  | ActionEvent
  | ConsoleEvent
  | ContextEvent
  | FeatureFlagEvent
  | PerformanceNavigationTimingsEvent
  | PerformanceResourceTimingsEvent
  | PerformanceEventTimingsEvent
  | PerformanceLongAnimationFrameTimingEvent

export const enum EVENT {
  URL = 'url',
  ACTION = 'action',
  ERROR = 'error',
  CONSOLE = 'console',
  CONTEXT = 'context',
  NAVIGATION_TIMING = 'navigationTiming',
  RESOURCE_TIMING = 'resourceTiming',
  EVENT_TIMING = 'eventTiming',
  LONG_ANIMATION_FRAME_TIMING = 'longAnimationFrameTiming',
  FEATURE_FLAG = 'featureFlag',
  GLOBAL_CONTEXT = 'globalContext',
  VIEW_CONTEXT = 'viewContext',
  USER = 'user',
  ACCOUNT = 'account',
}
