import {
  Context,
  Duration,
  ErrorSource,
  ErrorHandling,
  ResourceType,
  ServerDuration,
  TimeStamp,
} from '@datadog/browser-core'

export enum RumEventType {
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
  _dd?: {
    trace_id: string
    span_id?: string // not available for initial document tracing
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
    resource?: {
      url: string
      status_code: number
      method: string
    }
    id: string
    type?: string
    stack?: string
    handling_stack?: string
    source: ErrorSource
    message: string
    handling?: ErrorHandling
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
    in_foreground_periods?: InForegroundPeriod[]
  }
  session: {
    has_replay: true | undefined
  }
  _dd: {
    document_version: number
  }
}

export interface InForegroundPeriod {
  start: ServerDuration
  duration: ServerDuration
}

export enum ViewLoadingType {
  INITIAL_LOAD = 'initial_load',
  ROUTE_CHANGE = 'route_change',
}

export interface ViewCustomTimings {
  [key: string]: Duration
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
}

export interface RawRumActionEvent {
  date: TimeStamp
  type: RumEventType.ACTION
  action: {
    id: string
    type: ActionType
    loading_time?: ServerDuration
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
}

export enum ActionType {
  CLICK = 'click',
  CUSTOM = 'custom',
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
  session: {
    type: string
    has_replay?: boolean
  }
  _dd: {
    format_version: 2
    drift: number
  }
}

export interface ViewContext extends Context {
  session: {
    id: string | undefined
  }
  view: {
    id: string
    name?: string
    url: string
    referrer: string
  }
}

export interface ActionContext extends Context {
  action: {
    id: string
  }
}

export interface InternalContext {
  application_id: string
  session_id: string | undefined
  view?: {
    id: string
    url: string
    referrer: string
  }
  user_action?: {
    id: string
  }
}

export interface User {
  id?: string
  email?: string
  name?: string
  [key: string]: unknown
}

export interface CommonContext {
  user: User
  context: Context
  hasReplay?: true
}
