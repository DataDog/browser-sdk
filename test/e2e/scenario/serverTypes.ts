export interface ServerErrorMessage {
  message: string
  application_id: string
  session_id: string
  view: {
    id: string
  }
}

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
  }
}

export interface ServerRumEvent {
  date: number
  evt: {
    category: 'resource' | 'long_task' | 'user_action' | 'error' | 'view'
  }
}

interface PerformanceTiming {
  start: number
  duration: number
}

export interface ServerRumResourceEvent extends ServerRumEvent {
  evt: {
    category: 'resource'
  }
  http: {
    url: string
    method: string
    status_code: number
    performance?: {
      download: PerformanceTiming
      redirect: PerformanceTiming
    }
  }
  resource: {
    kind: 'fetch' | 'xhr' | 'document'
  }
  duration: number
  user_action?: {
    id: string
  }
}

export function isRumResourceEvent(event: ServerRumEvent): event is ServerRumResourceEvent {
  return event.evt.category === 'resource'
}

export interface ServerRumUserActionEvent extends ServerRumEvent {
  evt: {
    category: 'user_action'
    name: string
  }
  duration: number
  user_action: { id?: string; type: 'click' | 'custom' }
}

export function isRumUserActionEvent(event: ServerRumEvent): event is ServerRumUserActionEvent {
  return event.evt.category === 'user_action'
}

export interface ServerRumViewEvent extends ServerRumEvent {
  evt: {
    category: 'view'
  }
  rum: {
    document_version: number
  }
  session_id: string
  view: {
    id: string
    measures: {
      dom_complete: number
      dom_content_loaded: number
      dom_interactive: number
      load_event_end: number
    }
  }
}

export function isRumViewEvent(event: ServerRumEvent): event is ServerRumViewEvent {
  return event.evt.category === 'view'
}
