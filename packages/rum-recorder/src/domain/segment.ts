import { CreationReason, Record, RecordType, SegmentContext, SegmentMeta } from '../types'

export interface SegmentWriter {
  write(data: string): void
  complete(data: string, meta: SegmentMeta): void
}

export class Segment {
  private start: number
  private end: number
  private recordsCount: number
  private hasFullSnapshot: boolean
  private lastRecordType: RecordType

  constructor(
    private writer: SegmentWriter,
    readonly context: SegmentContext,
    private creationReason: CreationReason,
    initialRecord: Record
  ) {
    this.start = initialRecord.timestamp
    this.end = initialRecord.timestamp
    this.lastRecordType = initialRecord.type
    this.hasFullSnapshot = false
    this.recordsCount = 1
    this.writer.write(`{"records":[${JSON.stringify(initialRecord)}`)
  }

  addRecord(record: Record): void {
    this.end = record.timestamp
    if (!this.hasFullSnapshot) {
      // Note: to be exploitable by the replay, this field should be true only if the FullSnapshot
      // is preceded by a Meta record. Because rrweb is emitting both records synchronously and
      // contiguously, it should always be the case, but check it nonetheless.
      this.hasFullSnapshot = record.type === RecordType.FullSnapshot && this.lastRecordType === RecordType.Meta
    }
    this.lastRecordType = record.type
    this.recordsCount += 1
    this.writer.write(`,${JSON.stringify(record)}`)
  }

  complete() {
    const meta: SegmentMeta = {
      creation_reason: this.creationReason,
      end: this.end,
      has_full_snapshot: this.hasFullSnapshot,
      records_count: this.recordsCount,
      start: this.start,
      ...this.context,
    }
    this.writer.complete(`],${JSON.stringify(meta).slice(1)}\n`, meta)
  }
}
