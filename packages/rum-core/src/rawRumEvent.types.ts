import type {
  Context,
  Duration,
  ErrorSource,
  ErrorHandling,
  ResourceType,
  ServerDuration,
  TimeStamp,
  RawErrorCause,
  User,
} from '@datadog/browser-core'
import type { RumSessionPlan } from './domain/rumSessionManager'

export const enum RumEventType {
  ACTION = 'action',
  ERROR = 'error',
  LONG_TASK = 'long_task',
  VIEW = 'view',
  RESOURCE = 'resource',
}

export interface RawRumResourceEvent {
  date: TimeStamp
  type: RumEventType.RESOURCE
  resource: {
    type: ResourceType
    id: string
    duration: ServerDuration
    url: string
    method?: string
    status_code?: number
    size?: number
    redirect?: PerformanceResourceDetailsElement
    dns?: PerformanceResourceDetailsElement
    connect?: PerformanceResourceDetailsElement
    ssl?: PerformanceResourceDetailsElement
    first_byte?: PerformanceResourceDetailsElement
    download?: PerformanceResourceDetailsElement
  }
  _dd: {
    trace_id?: string
    span_id?: string // not available for initial document tracing
    rule_psr?: number
    discarded: boolean
  }
}

export interface PerformanceResourceDetailsElement {
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
    source: ErrorSource
    message: string
    handling?: ErrorHandling
    causes?: RawErrorCause[]
    source_type: 'browser'
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
    cumulative_layout_shift?: number
    custom_timings?: {
      [key: string]: ServerDuration
    }
    largest_contentful_paint?: ServerDuration
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
    in_foreground_periods?: InForegroundPeriod[]
  }
  session: {
    has_replay: true | undefined
  }
  _dd: {
    document_version: number
    replay_stats?: ReplayStats
  }
}

export interface InForegroundPeriod {
  start: ServerDuration
  duration: ServerDuration
}

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
    duration: ServerDuration
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
      position?: {
        x: number
        y: number
      }
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

export type RawRumEvent =
  | RawRumErrorEvent
  | RawRumResourceEvent
  | RawRumViewEvent
  | RawRumLongTaskEvent
  | RawRumActionEvent

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
  view: {
    id: string
    referrer?: string
    url: string
    name?: string
  }
  action?: {
    id: string | string[]
  }
  synthetics?: {
    test_id: string
    result_id: string
  }
  ci_test?: {
    test_execution_id: string
  }
  _dd: {
    format_version: 2
    drift: number
    session: {
      plan: RumSessionPlan
    }
    browser_sdk_version?: string
  }
}

export interface CommonContext {
  user: User
  context: Context
  hasReplay?: true
}
