import { monitor } from '@datadog/browser-core'
import { CreationReason, MouseMoveRecord, Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { getRecordStartEnd, groupMouseMoves, isMouseMoveRecord } from './recordUtils'

export const MAX_SEGMENT_DURATION = 30_000
export const MAX_MOUSE_MOVE_BATCH = 100

export interface SegmentWriter {
  write(data: string): void
  complete(data: string, meta: SegmentMeta): void
}

// Segments are the main data structure for session replays.  They contain context information used
// for indexing or UI needs, and a list of records (RRWeb 'events', renamed to avoid confusing
// namings).  They are stored without any processing from the intake, and fetched one after the
// other while a session is being replayed.  Their encoding (deflate) are carefully crafted to allow
// concatenating multiple segments together.  Their approximative size limits how often they are
// created have an impact on the replay.
//
// When the recording starts, a segment is initially created.  The segment is renewed (finalized,
// sent and replaced by a new one) based on various events (non-exhaustive list):
//
// * the page visibility change or becomes to unload
// * the segment duration reaches a limit
// * the encoded segment size reaches a limit
// * ...
//
// A segment cannot be created without its context.  If the RUM session ends and no session id is
// available when creating a new segment, records will be ignored, until the session is renewed and
// a new session id is available.
//
// Empty segments (segments with no record) aren't useful and should be ignored.
//
// To help investigate session replays issues, each segment is created with a "creation reason",
// indicating why the session has been created.

export function startSegmentCollection(getSegmentContext: () => SegmentContext | undefined, writer: SegmentWriter) {
  let currentSegment: Segment | undefined

  renewSegment('init')

  function renewSegment(creationReason: CreationReason) {
    if (currentSegment) {
      currentSegment.complete()
      currentSegment = undefined
    }

    const context = getSegmentContext()
    if (!context) {
      return
    }

    const localSegment = (currentSegment = new Segment(writer, context, creationReason))

    // Replace the newly created segment after MAX_SEGMENT_DURATION
    setTimeout(
      monitor(() => {
        if (currentSegment === localSegment) {
          renewSegment('max_duration')
        }
      }),
      MAX_SEGMENT_DURATION
    )
  }

  return {
    renewSegment,
    addRecord(record: Record) {
      if (!currentSegment) {
        return
      }

      currentSegment.addRecord(record)
    },
  }
}

export class Segment {
  private state?: RecordsIncrementalState

  // Mouse positions are being generated quite quickly (up to 1 every 50ms by default).  Using a
  // separate record for each position can add a consequent overhead to the segment encoded size.
  // To avoid this, we batch Mouse Move records coming from RRWeb and regroup them in a single
  // record.
  //
  // Note: the original RRWeb library does this internally, without exposing a way to control this.
  // To make sure mouse positions are correctly stored inside the Segment active when they occured,
  // we removed RRWeb batching strategy and recreated it at the Segment level.
  private batchedMouseMove: MouseMoveRecord[] = []

  constructor(
    private writer: SegmentWriter,
    readonly context: SegmentContext,
    private creationReason: CreationReason
  ) {}

  addRecord(record: Record): void {
    if (isMouseMoveRecord(record)) {
      if (this.batchedMouseMove.push(record) === MAX_MOUSE_MOVE_BATCH) {
        this.writeMouseMoves()
      }
    } else {
      this.writeRecord(record)
    }
  }

  complete() {
    this.writeMouseMoves()

    if (!this.state) {
      return
    }

    const meta: SegmentMeta = {
      creation_reason: this.creationReason,
      end: this.state.end,
      has_full_snapshot: this.state.hasFullSnapshot,
      records_count: this.state.recordsCount,
      start: this.state.start,
      ...this.context,
    }
    this.writer.complete(`],${JSON.stringify(meta).slice(1)}\n`, meta)
  }

  private writeMouseMoves() {
    if (this.batchedMouseMove.length === 0) {
      return
    }

    this.writeRecord(groupMouseMoves(this.batchedMouseMove))

    this.batchedMouseMove.length = 0
  }

  private writeRecord(record: Record): void {
    if (!this.state) {
      this.writer.write(`{"records":[${JSON.stringify(record)}`)
      this.state = new RecordsIncrementalState(record)
    } else {
      this.writer.write(`,${JSON.stringify(record)}`)
      this.state.addRecord(record)
    }
  }
}

export class RecordsIncrementalState {
  start: number
  end: number
  recordsCount: number
  hasFullSnapshot: boolean
  private lastRecordType: RecordType

  constructor(initialRecord: Record) {
    const [start, end] = getRecordStartEnd(initialRecord)
    this.start = start
    this.end = end
    this.lastRecordType = initialRecord.type
    this.hasFullSnapshot = false
    this.recordsCount = 1
  }

  addRecord(record: Record) {
    const [start, end] = getRecordStartEnd(record)
    this.start = Math.min(this.start, start)
    this.end = Math.max(this.end, end)
    if (!this.hasFullSnapshot) {
      // Note: to be exploitable by the replay, this field should be true only if the FullSnapshot
      // is preceded by a Meta record. Because rrweb is emitting both records synchronously and
      // contiguously, it should always be the case, but check it nonetheless.
      this.hasFullSnapshot = record.type === RecordType.FullSnapshot && this.lastRecordType === RecordType.Meta
    }
    this.lastRecordType = record.type
    this.recordsCount += 1
  }
}
