import { Context, ErrorSource, ResourceType } from '@datadog/browser-core'
import { ActionType } from './domain/rumEventsCollection/action/trackActions'
import { PerformanceResourceDetailsElement } from './domain/rumEventsCollection/resource/resourceUtils'
import { ViewCustomTimings, ViewLoadingType } from './domain/rumEventsCollection/view/trackViews'

export enum RumEventType {
  ACTION = 'action',
  ERROR = 'error',
  LONG_TASK = 'long_task',
  VIEW = 'view',
  RESOURCE = 'resource',
}

export interface RawRumResourceEvent {
  date: number
  type: RumEventType.RESOURCE
  resource: {
    type: ResourceType
    id?: string // only for traced requests
    duration: number
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

export interface RawRumErrorEvent {
  date: number
  type: RumEventType.ERROR
  error: {
    resource?: {
      url: string
      status_code: number
      method: string
    }
    type?: string
    stack?: string
    source: ErrorSource
    message: string
  }
}

export interface RawRumViewEvent {
  date: number
  type: RumEventType.VIEW
  view: {
    loading_type: ViewLoadingType
    first_contentful_paint?: number
    first_input_delay?: number
    first_input_time?: number
    cumulative_layout_shift?: number
    custom_timings?: ViewCustomTimings
    largest_contentful_paint?: number
    dom_interactive?: number
    dom_content_loaded?: number
    dom_complete?: number
    load_event?: number
    loading_time?: number
    time_spent: number
    is_active: boolean
    name?: string
    error: Count
    action: Count
    long_task: Count
    resource: Count
  }
  _dd: {
    document_version: number
  }
}

interface Count {
  count: number
}

export interface RawRumLongTaskEvent {
  date: number
  type: RumEventType.LONG_TASK
  long_task: {
    duration: number
  }
}

export interface RawRumActionEvent {
  date?: number
  type: RumEventType.ACTION
  action: {
    id?: string
    type: ActionType
    loading_time?: number
    error?: Count
    long_task?: Count
    resource?: Count
    target: {
      name: string
    }
  }
}

export type RawRumEvent =
  | RawRumErrorEvent
  | RawRumResourceEvent
  | RawRumViewEvent
  | RawRumLongTaskEvent
  | RawRumActionEvent

export interface RumContext {
  date: number
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
  }
}

export interface ViewContext extends Context {
  session: {
    id: string | undefined
  }
  view: {
    id: string
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
