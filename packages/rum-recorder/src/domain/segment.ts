import { CreationReason, Record, RecordType, SegmentContext, SegmentMeta } from '../types'

export interface SegmentWriter {
  write(data: string): void
  flush(data: string): void
}

export class Segment {
  public isFlushed = false

  private start: number
  private end: number
  private recordsCount: number
  private hasFullSnapshot: boolean

  constructor(
    private writer: SegmentWriter,
    readonly context: SegmentContext,
    private creationReason: CreationReason,
    initialRecord: Record
  ) {
    this.start = initialRecord.timestamp
    this.end = initialRecord.timestamp
    this.recordsCount = 1
    this.hasFullSnapshot = initialRecord.type === RecordType.FullSnapshot
    this.writer.write(`{"records":[${JSON.stringify(initialRecord)}`)
  }

  addRecord(record: Record): void {
    this.end = record.timestamp
    this.recordsCount += 1
    this.hasFullSnapshot ||= record.type === RecordType.FullSnapshot
    this.writer.write(`,${JSON.stringify(record)}`)
  }

  flush() {
    this.writer.flush(`],${JSON.stringify(this.meta).slice(1)}\n`)
    this.isFlushed = true
  }

  get meta(): SegmentMeta {
    return {
      creation_reason: this.creationReason,
      end: this.end,
      has_full_snapshot: this.hasFullSnapshot,
      records_count: this.recordsCount,
      start: this.start,
      ...this.context,
    }
  }
}
