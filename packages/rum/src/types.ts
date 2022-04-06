import type { TimeStamp } from '@datadog/browser-core'
import type { IncrementalData, SerializedNodeWithId } from './domain/record'

export { IncrementalSource, MutationData, ViewportResizeData, ScrollData } from './domain/record'

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
  | 'max_duration'
  | 'max_size'
  | 'view_change'
  | 'before_unload'
  | 'visibility_hidden'

export type Record =
  | FullSnapshotRecord
  | IncrementalSnapshotRecord
  | MetaRecord
  | FocusRecord
  | ViewEndRecord
  | VisualViewportRecord

export const RecordType = {
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Focus: 6,
  ViewEnd: 7,
  VisualViewport: 8,
} as const

export type RecordType = typeof RecordType[keyof typeof RecordType]

export interface FullSnapshotRecord {
  type: typeof RecordType.FullSnapshot
  timestamp: TimeStamp
  data: {
    node: SerializedNodeWithId
    initialOffset: {
      top: number
      left: number
    }
  }
}

export interface IncrementalSnapshotRecord {
  type: typeof RecordType.IncrementalSnapshot
  timestamp: TimeStamp
  data: IncrementalData
}

export interface MetaRecord {
  type: typeof RecordType.Meta
  timestamp: TimeStamp
  data: {
    href: string
    width: number
    height: number
  }
}

export interface FocusRecord {
  type: typeof RecordType.Focus
  timestamp: TimeStamp
  data: {
    has_focus: boolean
  }
}

export interface ViewEndRecord {
  type: typeof RecordType.ViewEnd
  timestamp: TimeStamp
}

export interface VisualViewportRecord {
  type: typeof RecordType.VisualViewport
  timestamp: TimeStamp
  data: {
    scale: number
    offsetLeft: number
    offsetTop: number
    pageLeft: number
    pageTop: number
    height: number
    width: number
  }
}
