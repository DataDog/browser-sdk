import { serializedNodeWithId } from 'rrweb-snapshot'
import type { IncrementalSource, MousePosition, IncrementalData } from './domain/rrweb/types'

export { IncrementalSource, MousePosition }

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
  | 'visibility_hidden'

export type RawRecord =
  | DomContentLoadedRecord
  | LoadedRecord
  | FullSnapshotRecord
  | IncrementalSnapshotRecord
  | MetaRecord
  | CustomRecord

export type Record = RawRecord & {
  timestamp: number
  delay?: number
}

export enum RecordType {
  DomContentLoaded,
  Load,
  FullSnapshot,
  IncrementalSnapshot,
  Meta,
  Custom,
}

export interface DomContentLoadedRecord {
  type: RecordType.DomContentLoaded
  data: object
}

export interface LoadedRecord {
  type: RecordType.Load
  data: object
}

export interface FullSnapshotRecord {
  type: RecordType.FullSnapshot
  data: {
    node: serializedNodeWithId
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

export interface CustomRecord<T = unknown> {
  type: RecordType.Custom
  data: {
    tag: string
    payload: T
  }
}
