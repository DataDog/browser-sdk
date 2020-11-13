import { Context, ErrorSource, ResourceType } from '@datadog/browser-core'
import { ActionCounts, ActionType } from './domain/rumEventsCollection/action/trackActions'
import { PerformanceResourceDetails } from './domain/rumEventsCollection/resource/resourceUtils'
import { Timings } from './domain/rumEventsCollection/view/trackTimings'
import { ViewLoadingType } from './domain/rumEventsCollection/view/trackViews'
import { EventCounts } from './domain/trackEventCounts'

export enum RumEventCategory {
  USER_ACTION = 'user_action',
  ERROR = 'error',
  LONG_TASK = 'long_task',
  VIEW = 'view',
  RESOURCE = 'resource',
}

export interface RumResourceEvent {
  date: number
  duration: number
  evt: {
    category: RumEventCategory.RESOURCE
  }
  http: {
    performance?: PerformanceResourceDetails
    method?: string
    statusCode?: number
    url: string
  }
  network?: {
    bytesWritten?: number
  }
  resource: {
    kind: ResourceType
    id?: string // only for traced requests
  }
  _dd?: {
    traceId: string
    spanId?: string // not available for initial document tracing
  }
}

export interface RumErrorEvent {
  date: number
  http?: {
    url: string
    status_code: number
    method: string
  }
  error: {
    kind?: string
    stack?: string
    origin: ErrorSource
  }
  evt: {
    category: RumEventCategory.ERROR
  }
  message: string
}

export interface RumViewEvent {
  date: number
  duration: number
  evt: {
    category: RumEventCategory.VIEW
  }
  rum: {
    documentVersion: number
  }
  view: {
    loadingTime?: number
    loadingType: ViewLoadingType
    measures: EventCounts & Timings
  }
}

export interface RumLongTaskEvent {
  date: number
  duration: number
  evt: {
    category: RumEventCategory.LONG_TASK
  }
}

export interface RumUserActionEvent {
  date?: number
  duration?: number
  evt: {
    category: RumEventCategory.USER_ACTION
    name: string
  }
  userAction: {
    id?: string
    type: ActionType
    measures?: ActionCounts
  }
}

export type RawRumEvent = RumErrorEvent | RumResourceEvent | RumViewEvent | RumLongTaskEvent | RumUserActionEvent

export interface RumContext {
  applicationId: string
  date: number
  service?: string
  session: {
    type: string
  }
}

export interface ViewContext extends Context {
  sessionId: string | undefined
  view: {
    id: string
    url: string
    referrer: string
  }
}

export interface ActionContext extends Context {
  userAction: {
    id: string
  }
}

export type RumEvent =
  | RumErrorEvent & ActionContext & ViewContext & RumContext
  | RumResourceEvent & ActionContext & ViewContext & RumContext
  | RumViewEvent & ViewContext & RumContext
  | RumLongTaskEvent & ActionContext & ViewContext & RumContext
  | RumUserActionEvent & ViewContext & RumContext

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
