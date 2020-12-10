import { ActionSchema, ErrorSchema, ResourceSchema, RumEventsFormat, ViewSchema } from '@datadog/browser-rum'

export interface ServerInternalMonitoringMessage {
  message: string
  status: string
  error: {
    kind: string
  }
}

export function isRumResourceEvent(event: RumEventsFormat): event is ResourceSchema {
  return event.type === 'resource'
}

export function isRumUserActionEvent(event: RumEventsFormat): event is ActionSchema {
  return event.type === 'action'
}

export function isRumViewEvent(event: RumEventsFormat): event is ViewSchema {
  return event.type === 'view'
}

export function isRumErrorEvent(event: RumEventsFormat): event is ErrorSchema {
  return event.type === 'error'
}
