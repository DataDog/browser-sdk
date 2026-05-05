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
  resourceUrl?: string
  subParts?: {
    loadDelay: number
    loadTime: number
    renderDelay: number
  }
}

export interface RumRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CumulativeLayoutShift {
  value: number
  targetSelector?: string
  time?: number
  previousRect?: RumRect
  currentRect?: RumRect
}

export interface InteractionToNextPaint {
  value: number
  targetSelector?: string
  time?: number
  subParts?: {
    inputDelay: number
    processingDuration: number
    presentationDelay: number
  }
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
    cumulative_layout_shift_time?: number
    /** Performance detail sub-object for deeper drill-down */
    performance?: {
      fcp?: { timestamp: number }
      lcp?: {
        timestamp: number
        target_selector?: string
        resource_url?: string
        sub_parts?: {
          load_delay: number
          load_time: number
          render_delay: number
        }
      }
      cls?: { score: number; timestamp?: number; target_selector?: string; previous_rect?: RumRect; current_rect?: RumRect }
      inp?: {
        duration: number
        timestamp?: number
        target_selector?: string
        sub_parts?: {
          input_delay: number
          processing_duration: number
          presentation_delay: number
        }
      }
    }
  }
  _dd: {
    document_version: number
  }
}

export interface ViewChangedSignal {
  viewId: string
  viewName?: string
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
