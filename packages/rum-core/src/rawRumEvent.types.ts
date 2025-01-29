import type {
  Context,
  Duration,
  ErrorSource,
  ErrorHandling,
  ResourceType,
  ServerDuration,
  TimeStamp,
  RawErrorCause,
  DefaultPrivacyLevel,
  Connectivity,
  Csp,
} from '@datadog/browser-core'
import type { PageState } from './domain/contexts/pageStateHistory'

export const enum RumEventType {
  ACTION = 'action',
  ERROR = 'error',
  LONG_TASK = 'long_task',
  VIEW = 'view',
  RESOURCE = 'resource',
  VITAL = 'vital',
}

export const enum RumLongTaskEntryType {
  LONG_TASK = 'long-task',
  LONG_ANIMATION_FRAME = 'long-animation-frame',
}

export interface RawRumResourceEvent {
  date: TimeStamp
  type: RumEventType.RESOURCE
  resource: {
    type: ResourceType
    id: string
    duration?: ServerDuration
    url: string
    method?: string
    status_code?: number
    size?: number
    encoded_body_size?: number
    decoded_body_size?: number
    transfer_size?: number
    render_blocking_status?: string
    redirect?: ResourceEntryDetailsElement
    dns?: ResourceEntryDetailsElement
    connect?: ResourceEntryDetailsElement
    ssl?: ResourceEntryDetailsElement
    worker?: ResourceEntryDetailsElement
    first_byte?: ResourceEntryDetailsElement
    download?: ResourceEntryDetailsElement
    protocol?: string
    delivery_type?: DeliveryType
  }
  _dd: {
    trace_id?: string
    span_id?: string // not available for initial document tracing
    rule_psr?: number
    discarded: boolean
    page_states?: PageStateServerEntry[]
  }
}

export interface ResourceEntryDetailsElement {
  duration: ServerDuration
  start: ServerDuration
}

export interface RawRumErrorEvent {
  date: TimeStamp
  type: RumEventType.ERROR
  error: {
    id: string
    type?: string
    stack?: string
    handling_stack?: string
    component_stack?: string
    fingerprint?: string
    source: ErrorSource
    message: string
    handling?: ErrorHandling
    causes?: RawErrorCause[]
    source_type: 'browser'
    csp?: Csp
  }
  view?: {
    in_foreground: boolean
  }
}

export interface RawRumViewEvent {
  date: TimeStamp
  type: RumEventType.VIEW
  view: {
    loading_type: ViewLoadingType
    first_byte?: ServerDuration
    first_contentful_paint?: ServerDuration
    first_input_delay?: ServerDuration
    first_input_time?: ServerDuration
    first_input_target_selector?: string
    interaction_to_next_paint?: ServerDuration
    interaction_to_next_paint_time?: ServerDuration
    interaction_to_next_paint_target_selector?: string
    cumulative_layout_shift?: number
    cumulative_layout_shift_time?: ServerDuration
    cumulative_layout_shift_target_selector?: string
    custom_timings?: {
      [key: string]: ServerDuration
    }
    largest_contentful_paint?: ServerDuration
    largest_contentful_paint_target_selector?: string
    dom_interactive?: ServerDuration
    dom_content_loaded?: ServerDuration
    dom_complete?: ServerDuration
    load_event?: ServerDuration
    loading_time?: ServerDuration
    time_spent: ServerDuration
    is_active: boolean
    name?: string
    error: Count
    action: Count
    long_task: Count
    resource: Count
    frustration: Count
    performance?: ViewPerformanceData
  }
  session: {
    has_replay: true | undefined
    is_active: false | undefined
  }
  display?: ViewDisplay
  privacy?: {
    replay_level: DefaultPrivacyLevel
  }
  _dd: {
    document_version: number
    replay_stats?: ReplayStats
    page_states?: PageStateServerEntry[]
    configuration: {
      start_session_replay_recording_manually: boolean
    }
  }
}

interface ViewDisplay {
  scroll: {
    max_depth?: number
    max_depth_scroll_top?: number
    max_scroll_height?: number
    max_scroll_height_time?: ServerDuration
  }
}

export interface ViewPerformanceData {
  cls?: {
    score: number
    timestamp?: ServerDuration
    target_selector?: string
    previous_rect?: RumRect
    current_rect?: RumRect
  }
  fcp?: {
    timestamp: number
  }
  fid?: {
    duration: ServerDuration
    timestamp: ServerDuration
    target_selector?: string
  }
  inp?: {
    duration: ServerDuration
    timestamp?: ServerDuration
    target_selector?: string
  }
  lcp?: {
    timestamp: ServerDuration
    target_selector?: string
  }
}

export interface RumRect {
  x: number
  y: number
  width: number
  height: number
}

export type PageStateServerEntry = { state: PageState; start: ServerDuration }

export const enum ViewLoadingType {
  INITIAL_LOAD = 'initial_load',
  ROUTE_CHANGE = 'route_change',
}

export interface ViewCustomTimings {
  [key: string]: Duration
}

export interface ReplayStats {
  records_count: number
  segments_count: number
  segments_total_raw_size: number
}

interface Count {
  count: number
}

export interface RawRumLongTaskEvent {
  date: TimeStamp
  type: RumEventType.LONG_TASK
  long_task: {
    id: string
    entry_type: RumLongTaskEntryType.LONG_TASK
    duration: ServerDuration
  }
  _dd: {
    discarded: boolean
  }
}

export type DeliveryType = 'cache' | 'navigational-prefetch' | 'other'

export type InvokerType =
  | 'user-callback'
  | 'event-listener'
  | 'resolve-promise'
  | 'reject-promise'
  | 'classic-script'
  | 'module-script'

export interface RawRumLongAnimationFrameEvent {
  date: TimeStamp
  type: RumEventType.LONG_TASK // LoAF are ingested as Long Task
  long_task: {
    id: string
    entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME
    duration: ServerDuration
    blocking_duration: ServerDuration
    first_ui_event_timestamp: ServerDuration
    render_start: ServerDuration
    style_and_layout_start: ServerDuration
    start_time: ServerDuration
    scripts: Array<{
      duration: ServerDuration
      pause_duration: ServerDuration
      forced_style_and_layout_duration: ServerDuration
      start_time: ServerDuration
      execution_start: ServerDuration
      source_url: string
      source_function_name: string
      source_char_position: number
      invoker: string
      invoker_type: InvokerType
      window_attribution: string
    }>
  }
  _dd: {
    discarded: boolean
  }
}

export interface RawRumActionEvent {
  date: TimeStamp
  type: RumEventType.ACTION
  action: {
    id: string
    type: ActionType
    loading_time?: ServerDuration
    frustration?: {
      type: FrustrationType[]
    }
    error?: Count
    long_task?: Count
    resource?: Count
    target: {
      name: string
    }
  }
  view?: {
    in_foreground: boolean
  }
  _dd?: {
    action?: {
      target?: {
        selector?: string
        width?: number
        height?: number
      }
      name_source?: string
      position?: {
        x: number
        y: number
      }
      pointer_up_delay?: Duration
    }
  }
}

export const enum ActionType {
  CLICK = 'click',
  CUSTOM = 'custom',
}

export const enum FrustrationType {
  RAGE_CLICK = 'rage_click',
  ERROR_CLICK = 'error_click',
  DEAD_CLICK = 'dead_click',
}

export interface RawRumVitalEvent {
  date: TimeStamp
  type: RumEventType.VITAL
  vital: {
    id: string
    name: string
    type: VitalType
    description?: string
    duration: number
  }
  _dd?: {
    vital: {
      computed_value: true
    }
  }
}

export const enum VitalType {
  DURATION = 'duration',
}

export type RawRumEvent =
  | RawRumErrorEvent
  | RawRumResourceEvent
  | RawRumViewEvent
  | RawRumLongTaskEvent
  | RawRumLongAnimationFrameEvent
  | RawRumActionEvent
  | RawRumVitalEvent

export interface RumContext {
  date: TimeStamp
  application: {
    id: string
  }
  service?: string
  version?: string
  source: 'browser'
  session: {
    id: string
    type: string
    has_replay?: boolean
  }
  display?: {
    viewport: {
      width: number
      height: number
    }
  }
  connectivity: Connectivity
  action?: {
    id: string | string[]
  }
  feature_flags?: Context
  synthetics?: {
    test_id: string
    result_id: string
  }
  ci_test?: {
    test_execution_id: string
  }
  context: Context
  _dd: {
    format_version: 2
    drift: number
    configuration: {
      session_sample_rate: number
      session_replay_sample_rate: number
    }
    browser_sdk_version?: string
  }
}
