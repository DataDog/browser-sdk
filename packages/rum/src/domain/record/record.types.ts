import type { RumMutationRecord } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import type {
  BrowserFullSnapshotRecord,
  BrowserIncrementalSnapshotRecord,
  BrowserRecord,
} from 'rum-events-format/session-replay-browser'
import type { SerializationKind, SerializationStats } from './serialization'

export type EmitRecordCallback<Record extends BrowserRecord = BrowserRecord> = (record: Record) => void
export type EmitStatsCallback = (stats: SerializationStats) => void

export type SerializeEvent =
  | {
      type: 'full'
      kind: SerializationKind
      target: Document
      timestamp: TimeStamp
      v1: BrowserFullSnapshotRecord
    }
  | {
      type: 'incremental'
      target: RumMutationRecord[]
      timestamp: TimeStamp
      v1: BrowserIncrementalSnapshotRecord
    }
