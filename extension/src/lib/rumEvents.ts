export enum LifeCycleEventType {
  ERROR_COLLECTED,
  PERFORMANCE_ENTRY_COLLECTED,
  CUSTOM_ACTION_COLLECTED,
  AUTO_ACTION_CREATED,
  AUTO_ACTION_COMPLETED,
  AUTO_ACTION_DISCARDED,
  VIEW_CREATED,
  VIEW_UPDATED,
  REQUEST_STARTED,
  REQUEST_COMPLETED,
  SESSION_RENEWED,
  RESOURCE_ADDED_TO_BATCH,
  DOM_MUTATED,
  BEFORE_UNLOAD,
}

export interface View {
  id: string
  location: Location
  measures: ViewMeasures
  documentVersion: number
  startTime: number
  duration: number
  loadingTime?: number | undefined
  loadingType: ViewLoadingType
}

export interface ViewMeasures {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoaded?: number
  domComplete?: number
  loadEventEnd?: number
  errorCount: number
  resourceCount: number
  longTaskCount: number
  userActionCount: number
}

export enum ViewLoadingType {
  INITIAL_LOAD = 'initial_load',
  ROUTE_CHANGE = 'route_change',
}

export interface ViewDetail {
  id: string
  date: number
  description: string
  events: RumEventDetail[]
}

export interface RumEventDetail {
  description: string
  color: string
  date: number
  event: any // TODO switch to RumEvent
}

export interface RumEvent {
  date: number
  duration: number
  message: string
  userAction: {
    type: string
  }
  evt: {
    category: string
    name: string
  }
  view: {
    id: string
    url: string
  }
  http: {
    url: string
  }
}

export const RUM_EVENT_COLOR = {
  error: 'rgb(246, 111, 120)',
  resource: 'rgb(132, 193, 224)',
  view: 'rgb(40, 122, 163)',
  long_task: 'rgb(255, 203, 107)',
  user_action: 'rgb(146, 110, 182)',
}
