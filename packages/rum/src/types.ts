import { IncrementalData, SerializedNodeWithId } from './domain/record/types'

export { IncrementalSource, MutationData, ViewportResizeData, ScrollData } from './domain/record/types'

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
  | 'before_unload'
  | 'visibility_hidden'

export type RawRecord =
  | FullSnapshotRecord
  | IncrementalSnapshotRecord
  | MetaRecord
  | FocusRecord
  | ViewEndRecord
  | VisualViewportRecord

export type Record = RawRecord & {
  timestamp: number
  delay?: number
}

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
  data: IncrementalData
}

export interface MetaRecord {
  type: typeof RecordType.Meta
  data: {
    href: string
    width: number
    height: number
  }
}

export interface FocusRecord {
  type: typeof RecordType.Focus
  data: {
    has_focus: boolean
  }
}

export interface ViewEndRecord {
  type: typeof RecordType.ViewEnd
}

export interface VisualViewportRecord {
  type: typeof RecordType.VisualViewport
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
