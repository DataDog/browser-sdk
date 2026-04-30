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
  time?: number
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
  /** @deprecated Use view.time_spent in serialized output */
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

/**
 * Serialized view event — matches v6 wire format.
 * Published to 'observation:view' in place of ViewObservation.
 */
export interface SerializedViewEvent {
  type: 'view'
  date: number
  view: {
    id: string
    name?: string
    url: string
    referrer: string
    loading_type: ViewLoadingType
    is_active: boolean
    time_spent: number
    // Flat navigation timings
    first_byte?: number
    dom_interactive?: number
    dom_content_loaded?: number
    dom_complete?: number
    load_event?: number
    // Flat web vitals
    first_contentful_paint?: number
    largest_contentful_paint?: number
    largest_contentful_paint_target_selector?: string
    cumulative_layout_shift?: number
    cumulative_layout_shift_target_selector?: string
    interaction_to_next_paint?: number
    interaction_to_next_paint_target_selector?: string
    loading_time?: number
    // Event counts
    error: { count: number }
    action: { count: number }
    resource: { count: number }
    long_task: { count: number }
    frustration: { count: number }
  }
  _dd: {
    document_version: number
  }
  /** Performance detail sub-object for deeper drill-down */
  performance?: {
    fcp?: { timestamp: number }
    lcp?: { timestamp: number; target_selector?: string }
    cls?: { score: number; timestamp?: number; target_selector?: string }
    inp?: { duration: number; timestamp?: number; target_selector?: string }
  }
}

export interface ViewChangedSignal {
  viewId: string
}

// Extend the shared pipeline event map
declare module '@datadog/core-next' {
  interface SdkEventMap {
    'resource:navigation': NavigationResource
    'action:start_view': StartViewAction
    'observation:view': SerializedViewEvent
    'signal:view_changed': ViewChangedSignal
  }
}
