import { CreationReason, Record, RecordType, SegmentContext, SegmentMeta } from '../types'

export interface SegmentWriter {
  write(data: string): void
  flush(data: string, meta: SegmentMeta): void
}

export class Segment {
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
    const meta: SegmentMeta = {
      creation_reason: this.creationReason,
      end: this.end,
      has_full_snapshot: this.hasFullSnapshot,
      records_count: this.recordsCount,
      start: this.start,
      ...this.context,
    }
    this.writer.flush(`],${JSON.stringify(meta).slice(1)}\n`, meta)
  }
}
