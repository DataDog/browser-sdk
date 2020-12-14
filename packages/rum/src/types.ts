import { Context, ErrorSource, ResourceType } from '@datadog/browser-core'
import { ActionType } from './domain/rumEventsCollection/action/trackActions'
import { PerformanceResourceDetailsElement } from './domain/rumEventsCollection/resource/resourceUtils'
import { ViewLoadingType } from './domain/rumEventsCollection/view/trackViews'

export enum RumEventType {
  ACTION = 'action',
  ERROR = 'error',
  LONG_TASK = 'long_task',
  VIEW = 'view',
  RESOURCE = 'resource',
}

export interface RumResourceEvent {
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

export interface RumErrorEvent {
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

export interface RumViewEvent {
  date: number
  type: RumEventType.VIEW
  view: {
    loadingType: ViewLoadingType
    firstContentfulPaint?: number
    firstInputDelay?: number
    cumulativeLayoutShift?: number
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

export interface RumLongTaskEvent {
  date: number
  type: RumEventType.LONG_TASK
  longTask: {
    duration: number
  }
}

export interface RumActionEvent {
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

export type RawRumEvent = RumErrorEvent | RumResourceEvent | RumViewEvent | RumLongTaskEvent | RumActionEvent

export interface RumContext {
  date: number
  application: {
    id: string
  }
  service?: string
  session: {
    type: string
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

export type RumEvent =
  | RumErrorEvent & ActionContext & ViewContext & RumContext
  | RumResourceEvent & ActionContext & ViewContext & RumContext
  | RumViewEvent & ViewContext & RumContext
  | RumLongTaskEvent & ActionContext & ViewContext & RumContext
  | RumActionEvent & ViewContext & RumContext

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
