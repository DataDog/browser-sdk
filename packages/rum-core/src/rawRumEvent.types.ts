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
    statusCode?: number
    size?: number
    redirect?: PerformanceResourceDetailsElement
    dns?: PerformanceResourceDetailsElement
    connect?: PerformanceResourceDetailsElement
    ssl?: PerformanceResourceDetailsElement
    firstByte?: PerformanceResourceDetailsElement
    download?: PerformanceResourceDetailsElement
  }
  _dd?: {
    traceId: string
    spanId?: string // not available for initial document tracing
  }
}

export interface RawRumErrorEvent {
  date: number
  type: RumEventType.ERROR
  error: {
    resource?: {
      url: string
      statusCode: number
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
    loadingType: ViewLoadingType
    firstContentfulPaint?: number
    firstInputDelay?: number
    firstInputTime?: number
    cumulativeLayoutShift?: number
    customTimings?: ViewCustomTimings
    largestContentfulPaint?: number
    domInteractive?: number
    domContentLoaded?: number
    domComplete?: number
    loadEvent?: number
    loadingTime?: number
    timeSpent: number
    isActive: boolean
    error: Count
    action: Count
    longTask: Count
    resource: Count
  }
  _dd: {
    documentVersion: number
  }
}

interface Count {
  count: number
}

export interface RawRumLongTaskEvent {
  date: number
  type: RumEventType.LONG_TASK
  longTask: {
    duration: number
  }
}

export interface RawRumActionEvent {
  date?: number
  type: RumEventType.ACTION
  action: {
    id?: string
    type: ActionType
    loadingTime?: number
    error?: Count
    longTask?: Count
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
    formatVersion: 2
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

export type AssembledRumEvent =
  | (RawRumErrorEvent & ActionContext & ViewContext & RumContext)
  | (RawRumResourceEvent & ActionContext & ViewContext & RumContext)
  | (RawRumViewEvent & ViewContext & RumContext)
  | (RawRumLongTaskEvent & ActionContext & ViewContext & RumContext)
  | (RawRumActionEvent & ViewContext & RumContext)

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
  hasReplay?: boolean
}
