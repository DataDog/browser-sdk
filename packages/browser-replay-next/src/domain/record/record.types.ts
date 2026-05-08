import type { BrowserFullSnapshotRecord, BrowserIncrementalSnapshotRecord, BrowserRecord } from '../../types/sessionReplay'
import type { SerializationKind, SerializationStats } from './serialization'

export type EmitRecordCallback<Record extends BrowserRecord = BrowserRecord> = (record: Record) => void
export type EmitStatsCallback = (stats: SerializationStats) => void

// RumMutationRecord types (inlined from rum-core to avoid dependency)
export interface RumCharacterDataMutationRecord {
  type: 'characterData'
  target: Node
  oldValue: string | null
}

export interface RumAttributesMutationRecord {
  type: 'attributes'
  target: Element
  oldValue: string | null
  attributeName: string
}

export interface RumChildListMutationRecord {
  type: 'childList'
  target: Node
  addedNodes: NodeList
  removedNodes: NodeList
}

export type RumMutationRecord =
  | RumCharacterDataMutationRecord
  | RumAttributesMutationRecord
  | RumChildListMutationRecord

export type SerializeEvent =
  | {
      type: 'full'
      kind: SerializationKind
      target: Document
      timestamp: number
      v1: BrowserFullSnapshotRecord
    }
  | {
      type: 'incremental'
      target: RumMutationRecord[]
      timestamp: number
      v1: BrowserIncrementalSnapshotRecord
    }
