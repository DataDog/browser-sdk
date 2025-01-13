// Returns the first MetaRecord in a Segment, if any.
import type {
  BrowserSegment,
  MetaRecord,
  BrowserRecord,
  BrowserFullSnapshotRecord,
  MouseInteractionType,
  BrowserIncrementalSnapshotRecord,
  VisualViewportRecord,
  FrustrationRecord,
} from '../src/types'
import { RecordType, IncrementalSource } from '../src/types'

export function findMeta(segment: BrowserSegment): MetaRecord | null {
  return segment.records.find((record) => record.type === RecordType.Meta) as MetaRecord
}

// Returns the first FullSnapshotRecord in a Segment, if any.
export function findFullSnapshot({ records }: { records: BrowserRecord[] }): BrowserFullSnapshotRecord | null {
  return records.find((record) => record.type === RecordType.FullSnapshot) as BrowserFullSnapshotRecord
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
  segments: BrowserSegment | BrowserSegment[],
  source: IncrementalSource
): BrowserIncrementalSnapshotRecord[] {
  return getAllrecords(segments).filter(
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

export function getAllrecords(segments: BrowserSegment | BrowserSegment[]): BrowserRecord[] {
  return Array.isArray(segments) ? segments.flatMap((segment) => segment.records) : segments.records
}
