export type ViewLoadingType = 'initial_load' | 'route_change' | 'bf_cache'

export interface NavigationResource {
  url: string
  startTime: number
  startDate: number
  referrer: string
  loadingType: ViewLoadingType
  name?: string
}

export interface StartViewAction {
  url: string
  startTime: number
  startDate: number
  referrer: string
  loadingType: 'route_change'
  name?: string
}

export interface LargestContentfulPaint {
  value: number
  targetSelector?: string
}

export interface CumulativeLayoutShift {
  value: number
  targetSelector?: string
}

export interface InteractionToNextPaint {
  value: number
  targetSelector?: string
}

export interface NavigationTimings {
  domComplete: number
  domContentLoaded: number
  domInteractive: number
  loadEvent: number
  firstByte: number
}

export interface EventCounts {
  actionCount: number
  errorCount: number
  resourceCount: number
  longTaskCount: number
  frustrationCount: number
}

export interface ViewObservation {
  id: string
  url: string
  referrer: string
  loadingType: ViewLoadingType
  startTime: number
  startDate: number
  date: number
  duration: number
  documentVersion: number
  isActive: boolean
  name?: string

  // Core Web Vitals
  firstContentfulPaint?: number
  largestContentfulPaint?: LargestContentfulPaint
  cumulativeLayoutShift?: CumulativeLayoutShift
  interactionToNextPaint?: InteractionToNextPaint

  // Navigation timings (initial load only)
  navigationTimings?: NavigationTimings

  // Loading time
  loadingTime?: number

  // Scroll metrics
  scroll?: {
    maxDepth: number
    maxScrollHeight: number
  }

  // Event counts
  eventCounts?: EventCounts

  [key: string]: unknown
}

export interface ViewChangedSignal {
  viewId: string
}

// Extend the shared pipeline event map
declare module '@datadog/core-next' {
  interface SdkEventMap {
    'resource:navigation': NavigationResource
    'action:start_view': StartViewAction
    'observation:view': ViewObservation
    'signal:view_changed': ViewChangedSignal
  }
}
