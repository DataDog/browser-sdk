import {
  CreationReason,
  IncrementalSource,
  MouseMoveRecord,
  Record,
  RecordType,
  SegmentContext,
  SegmentMeta,
} from '../types'

export interface SegmentWriter {
  write(data: string): void
  complete(data: string, meta: SegmentMeta): void
}

export const MAX_MOUSE_MOVE_BATCH = 100

export class Segment {
  private state?: RecordsIncrementalState

  // Mouse positions are being generated quite quickly (up to 1 every 50ms by default).  Using a
  // separate record for each position can add a consequent overhead to the segment encoded size.
  // To avoid this, we batch Mouse Move records coming from RRWeb and regroup them in a single
  // record.
  //
  // Note: the original RRWeb library does this internally, without exposing a way to control this.
  // To make sure mouse positions are correctly stored inside the Segment active when they occurred,
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

export function isMouseMoveRecord(record: Record): record is MouseMoveRecord {
  return (
    record.type === RecordType.IncrementalSnapshot &&
    (record.data.source === IncrementalSource.MouseMove || record.data.source === IncrementalSource.TouchMove)
  )
}

export function groupMouseMoves(records: MouseMoveRecord[]): MouseMoveRecord {
  const mostRecentTimestamp = records[records.length - 1]!.timestamp
  return {
    data: {
      // Because we disabled mouse move batching from RRWeb, there will be only one position in each
      // record, and its timeOffset will be 0.
      positions: records.map(({ timestamp, data: { positions: [position] } }) => ({
        ...position,
        timeOffset: timestamp - mostRecentTimestamp,
      })),
      source: records[0]!.data.source,
    },
    timestamp: mostRecentTimestamp,
    type: RecordType.IncrementalSnapshot,
  }
}

export function getRecordStartEnd(record: Record): [number, number] {
  if (isMouseMoveRecord(record)) {
    return [record.timestamp + record.data.positions[0]!.timeOffset, record.timestamp]
  }
  return [record.timestamp, record.timestamp]
}
