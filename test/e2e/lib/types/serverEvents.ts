export interface ServerLogsMessage {
  message: string
  application_id: string
  view: {
    id: number
  }
  error?: {
    stack?: string
  }
  http?: {
    status_code?: number
    url: string
  }
}

export interface ServerInternalMonitoringMessage {
  message: string
  status: string
  error: {
    kind: string
  }
}

export interface ServerRumEvent {
  date: number
  type: 'resource' | 'long_task' | 'action' | 'error' | 'view'
}

interface PerformanceTiming {
  start: number
  duration: number
}

export interface ServerRumResourceEvent extends ServerRumEvent {
  type: 'resource'
  resource: {
    url: string
    method: string
    status_code: number
    download: PerformanceTiming
    redirect: PerformanceTiming
    type: 'fetch' | 'xhr' | 'document'
    id?: string
    duration: number
  }
  _dd?: {
    trace_id: string
    span_id?: string
  }
  action?: {
    id: string
  }
}

export function isRumResourceEvent(event: ServerRumEvent): event is ServerRumResourceEvent {
  return event.type === 'resource'
}

export interface ServerRumActionEvent extends ServerRumEvent {
  type: 'action'
  action: {
    loading_time: number
    id?: string
    type: 'click' | 'custom'
    resource: {
      count: number
    }
    error: {
      count: number
    }
    long_task: {
      count: number
    }
    target: {
      name: string
    }
  }
}

export function isRumUserActionEvent(event: ServerRumEvent): event is ServerRumActionEvent {
  return event.type === 'action'
}

export enum ServerRumViewLoadingType {
  INITIAL_LOAD = 'initial_load',
  ROUTE_CHANGE = 'route_change',
}

export interface ServerRumViewEvent extends ServerRumEvent {
  type: 'view'
  _dd: {
    document_version: number
  }
  session: {
    id: string
  }
  view: {
    id: string
    loading_type: ServerRumViewLoadingType
    dom_complete: number
    dom_content_loaded: number
    dom_interactive: number
    load_event_end: number
    first_input_delay?: number
  }
}

export function isRumViewEvent(event: ServerRumEvent): event is ServerRumViewEvent {
  return event.type === 'view'
}

export interface ServerRumErrorEvent extends ServerRumEvent {
  type: 'error'
  error: {
    message: string
    source: string
  }
}

export function isRumErrorEvent(event: ServerRumEvent): event is ServerRumErrorEvent {
  return event.type === 'error'
}
