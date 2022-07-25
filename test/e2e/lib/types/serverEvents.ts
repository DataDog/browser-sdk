import type { RumActionEvent, RumErrorEvent, RumEvent, RumResourceEvent, RumViewEvent } from '@datadog/browser-rum'
import type { BrowserSegment as Segment } from '@datadog/browser-rum/src/types'

export function isRumResourceEvent(event: RumEvent): event is RumResourceEvent {
  return event.type === 'resource'
}

export function isRumActionEvent(event: RumEvent): event is RumActionEvent {
  return event.type === 'action'
}

export function isRumViewEvent(event: RumEvent): event is RumViewEvent {
  return event.type === 'view'
}

export function isRumErrorEvent(event: RumEvent): event is RumErrorEvent {
  return event.type === 'error'
}

export interface SegmentFile {
  filename: string
  encoding: string
  mimetype: string
  data: Segment
}

export interface SessionReplayCall {
  segment: SegmentFile
  metadata: { [key: string]: string }
}
