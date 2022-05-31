import type { Record } from './record'

export interface Segment extends SegmentMetadata {
  records: Record[]
}

export interface SegmentMetadata extends SegmentContext {
  start: number
  end: number
  has_full_snapshot: boolean
  records_count: number
  creation_reason: CreationReason
  index_in_view: number
}

export interface SegmentContext {
  application: { id: string }
  session: { id: string }
  view: { id: string }
}

export type CreationReason =
  | 'init'
  | 'segment_duration_limit'
  | 'segment_bytes_limit'
  | 'view_change'
  | 'before_unload'
  | 'visibility_hidden'
