import { RumActionEvent, RumErrorEvent, RumEvent, RumResourceEvent, RumViewEvent } from '@datadog/browser-rum'

export interface ServerInternalMonitoringMessage {
  message: string
  status: string
  error: {
    kind: string
  }
}

export function isRumResourceEvent(event: RumEvent): event is RumResourceEvent {
  return event.type === 'resource'
}

export function isRumUserActionEvent(event: RumEvent): event is RumActionEvent {
  return event.type === 'action'
}

export function isRumViewEvent(event: RumEvent): event is RumViewEvent {
  return event.type === 'view'
}

export function isRumErrorEvent(event: RumEvent): event is RumErrorEvent {
  return event.type === 'error'
}
