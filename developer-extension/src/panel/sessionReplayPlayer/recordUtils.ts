import type {
  BrowserIncrementalSnapshotRecord,
  BrowserRecord,
  MetaRecord,
  MousemoveData,
} from '@datadog/browser-rum/src/types'
import { IncrementalSource, RecordType } from '@datadog/browser-rum/src/types'

export function isStartOfFullSnapshot(record: BrowserRecord): record is MetaRecord {
  // All full snapshots start with a Meta record.
  return record.type === RecordType.Meta
}

export function isMouseMovementRecord(
  record: BrowserRecord
): record is BrowserIncrementalSnapshotRecord & { data: MousemoveData } {
  return record.type === RecordType.IncrementalSnapshot && record.data.source === IncrementalSource.MouseMove
}
