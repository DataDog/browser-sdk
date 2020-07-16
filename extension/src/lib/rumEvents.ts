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
