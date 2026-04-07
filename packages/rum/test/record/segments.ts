// Returns the first MetaRecord in a Segment, if any.
import type {
  BrowserSegment,
  MetaRecord,
  BrowserRecord,
  BrowserFullSnapshotRecord,
  BrowserFullSnapshotV1Record,
  BrowserFullSnapshotChangeRecord,
  MouseInteractionType,
  BrowserIncrementalSnapshotRecord,
  VisualViewportRecord,
  FrustrationRecord,
  SnapshotFormatV1,
  SnapshotFormatChange,
} from 'rum-events-format/session-replay-browser'
import { RecordType, IncrementalSource, SnapshotFormat } from 'rum-events-format/session-replay-browser'

export function findMeta(segment: BrowserSegment): MetaRecord | null {
  return segment.records.find((record) => record.type === RecordType.Meta) as MetaRecord
}

// Returns the first FullSnapshotRecord in a Segment, if any.
export function findFullSnapshot({ records }: { records: BrowserRecord[] }): BrowserFullSnapshotV1Record | null {
  return (
    records.find(
      (record): record is BrowserFullSnapshotV1Record =>
        record.type === RecordType.FullSnapshot && record.format !== SnapshotFormat.Change
    ) ?? null
  )
}

/** Returns the FullSnapshotRecord in the given format in a Segment, if any. */
export function findFullSnapshotInFormat(
  format: SnapshotFormatV1,
  { records }: { records: BrowserRecord[] }
): BrowserFullSnapshotV1Record | null
export function findFullSnapshotInFormat(
  format: SnapshotFormatChange,
  { records }: { records: BrowserRecord[] }
): BrowserFullSnapshotChangeRecord | null
export function findFullSnapshotInFormat(
  format: SnapshotFormat,
  { records }: { records: BrowserRecord[] }
): BrowserFullSnapshotRecord | null {
  return records.find(
    (record) => record.type === RecordType.FullSnapshot && (record.format ?? SnapshotFormat.V1) === format
  ) as BrowserFullSnapshotRecord
}

// Returns all the VisualViewportRecords in a Segment, if any.
export function findAllVisualViewports(segment: BrowserSegment): VisualViewportRecord[] {
  return segment.records.filter((record) => record.type === RecordType.VisualViewport)
}

// Returns the first IncrementalSnapshotRecord of a given source in a Segment, if any.
export function findIncrementalSnapshot(
  segment: BrowserSegment,
  source: IncrementalSource
): BrowserIncrementalSnapshotRecord | null {
  return segment.records.find(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as BrowserIncrementalSnapshotRecord
}

// Returns all the IncrementalSnapshotRecord of a given source in a Segment, if any.
export function findAllIncrementalSnapshots(
  { records }: { records: BrowserRecord[] },
  source: IncrementalSource
): BrowserIncrementalSnapshotRecord[] {
  return records.filter(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as BrowserIncrementalSnapshotRecord[]
}

// Returns all the FrustrationRecords in the given Segment, if any.
export function findAllFrustrationRecords(segment: BrowserSegment): FrustrationRecord[] {
  return segment.records.filter((record) => record.type === RecordType.FrustrationRecord)
}

// Returns all the IncrementalSnapshotRecords of the given MouseInteraction source, if any
export function findMouseInteractionRecords(
  segment: BrowserSegment,
  source: MouseInteractionType
): BrowserIncrementalSnapshotRecord[] {
  return findAllIncrementalSnapshots(segment, IncrementalSource.MouseInteraction).filter(
    (record) => 'type' in record.data && record.data.type === source
  )
}
