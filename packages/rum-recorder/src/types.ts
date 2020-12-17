// Alias EventWithTime to Record, to avoid naming clash between RRWeb events and RUM events
import {
  EventType as RecordType,
  EventWithTime as Record,
  IncrementalSource,
  MousePosition,
} from './domain/rrweb/types'

export { Record, RecordType, IncrementalSource, MousePosition }

export interface MouseMoveRecord {
  type: RecordType.IncrementalSnapshot
  timestamp: number
  data: {
    source: IncrementalSource.TouchMove | IncrementalSource.MouseMove
    positions: MousePosition[]
  }
}

export interface Segment extends SegmentMeta {
  records: Record[]
}

export interface SegmentMeta extends SegmentContext {
  start: number
  end: number
  has_full_snapshot: boolean
  records_count: number
  creation_reason: CreationReason
}

export interface SegmentContext {
  application: { id: string }
  session: { id: string }
  view: { id: string }
}

export type CreationReason =
  | 'init'
  | 'max_duration'
  | 'max_size'
  | 'view_change'
  | 'session_renewed'
  | 'before_unload'
  | 'visibility_change'
