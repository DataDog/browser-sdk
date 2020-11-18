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

export interface RumResourceEventV2 {
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

export interface RumErrorEventV2 {
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

export interface RumViewEventV2 {
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
    loadEventEnd?: number
    loadingTime?: number
    timeSpent: number
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

export interface RumLongTaskEventV2 {
  date: number
  type: RumEventType.LONG_TASK
  longTask: {
    duration: number
  }
}

export interface RumActionEventV2 {
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

export type RawRumEventV2 =
  | RumErrorEventV2
  | RumResourceEventV2
  | RumViewEventV2
  | RumLongTaskEventV2
  | RumActionEventV2

export interface RumContextV2 {
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

export interface ViewContextV2 extends Context {
  session: {
    id: string | undefined
  }
  view: {
    id: string
    url: string
    referrer: string
  }
}

export interface ActionContextV2 extends Context {
  action: {
    id: string
  }
}

export type RumEventV2 =
  | RumErrorEventV2 & ActionContextV2 & ViewContextV2 & RumContextV2
  | RumResourceEventV2 & ActionContextV2 & ViewContextV2 & RumContextV2
  | RumViewEventV2 & ViewContextV2 & RumContextV2
  | RumLongTaskEventV2 & ActionContextV2 & ViewContextV2 & RumContextV2
  | RumActionEventV2 & ViewContextV2 & RumContextV2
