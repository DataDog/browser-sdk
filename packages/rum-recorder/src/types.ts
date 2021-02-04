import { SerializedNodeWithId } from './domain/rrweb-snapshot'
import type { IncrementalData } from './domain/rrweb/types'

export { IncrementalSource } from './domain/rrweb/types'

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

export type RawRecord = FullSnapshotRecord | IncrementalSnapshotRecord | MetaRecord | FocusRecord | ViewEndRecord

export type Record = RawRecord & {
  timestamp: number
  delay?: number
}

export enum RecordType {
  _0, // previously DomContentLoaded
  _1, // previously Load
  FullSnapshot,
  IncrementalSnapshot,
  Meta,
  _2, // previously Custom
  Focus,
  ViewEnd,
}

export interface FullSnapshotRecord {
  type: RecordType.FullSnapshot
  data: {
    node: SerializedNodeWithId
    initialOffset: {
      top: number
      left: number
    }
  }
}

export interface IncrementalSnapshotRecord {
  type: RecordType.IncrementalSnapshot
  data: IncrementalData
}

export interface MetaRecord {
  type: RecordType.Meta
  data: {
    href: string
    width: number
    height: number
  }
}

export interface FocusRecord {
  type: RecordType.Focus
  data: {
    has_focus: boolean
  }
}

export interface ViewEndRecord {
  type: RecordType.ViewEnd
}
