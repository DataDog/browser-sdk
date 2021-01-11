import { monitor } from '@datadog/browser-core'
import { CreationReason, MouseMoveRecord, Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { getRecordStartEnd, groupMouseMoves, isMouseMoveRecord } from './recordUtils'

export const MAX_SEGMENT_DURATION = 30_000
export const MAX_MOUSE_MOVE_BATCH = 100

export interface SegmentWriter {
  write(data: string): void
  complete(data: string, meta: SegmentMeta): void
}

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
