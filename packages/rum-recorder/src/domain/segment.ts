import { CreationReason, Record, RecordType, SegmentContext, SegmentMeta } from '../types'

export interface SegmentWriter {
  write(data: string): void
  complete(data: string, meta: SegmentMeta): void
}

export class Segment {
  private state?: RecordsIncrementalState

  constructor(
    private writer: SegmentWriter,
    readonly context: SegmentContext,
    private creationReason: CreationReason
  ) {}

  addRecord(record: Record): void {
    if (!this.state) {
      this.writer.write(`{"records":[${JSON.stringify(record)}`)
      this.state = new RecordsIncrementalState(record)
    } else {
      this.writer.write(`,${JSON.stringify(record)}`)
      this.state.addRecord(record)
    }
  }

  complete() {
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
}

export class RecordsIncrementalState {
  start: number
  end: number
  recordsCount: number
  hasFullSnapshot: boolean
  private lastRecordType: RecordType

  constructor(initialRecord: Record) {
    this.start = initialRecord.timestamp
    this.end = initialRecord.timestamp
    this.lastRecordType = initialRecord.type
    this.hasFullSnapshot = false
    this.recordsCount = 1
  }

  addRecord(record: Record) {
    this.end = record.timestamp
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
