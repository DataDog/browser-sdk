import { CreationReason, Record, RecordType, SegmentContext, SegmentMeta } from '../types'

export interface SegmentWriter {
  write(data: string): void
  flush(data: string, meta: SegmentMeta): void
}

const enum FullSnapshotState {
  WaitingForMeta,
  WaitingForFocus,
  WaitingForFullSnapshot,
  HasFullSnapshot,
}

export class Segment {
  private start: number
  private end: number
  private recordsCount: number
  private fullSnapshotState: FullSnapshotState

  constructor(
    private writer: SegmentWriter,
    readonly context: SegmentContext,
    private creationReason: CreationReason,
    initialRecord: Record
  ) {
    this.start = initialRecord.timestamp
    this.end = initialRecord.timestamp
    this.recordsCount = 1
    this.fullSnapshotState = reduceFullSnapshotState(FullSnapshotState.WaitingForMeta, initialRecord)
    this.writer.write(`{"records":[${JSON.stringify(initialRecord)}`)
  }

  addRecord(record: Record): void {
    this.end = record.timestamp
    this.recordsCount += 1
    this.fullSnapshotState = reduceFullSnapshotState(this.fullSnapshotState, record)
    this.writer.write(`,${JSON.stringify(record)}`)
  }

  flush() {
    const meta: SegmentMeta = {
      creation_reason: this.creationReason,
      end: this.end,
      has_full_snapshot: this.fullSnapshotState === FullSnapshotState.HasFullSnapshot,
      records_count: this.recordsCount,
      start: this.start,
      ...this.context,
    }
    this.writer.flush(`],${JSON.stringify(meta).slice(1)}\n`, meta)
  }
}

function reduceFullSnapshotState(currentState: FullSnapshotState, record: Record): FullSnapshotState {
  // Note: to be exploitable by the replay, we have to ensure that FullSnapshot record is
  // preceded by a Meta and a Focus records.  Because the record logic is emitting both records
  // synchronously and contiguously, it should always be the case, but check it nonetheless.
  switch (currentState) {
    case FullSnapshotState.WaitingForMeta:
      return record.type === RecordType.Meta ? FullSnapshotState.WaitingForFocus : FullSnapshotState.WaitingForMeta

    case FullSnapshotState.WaitingForFocus:
      return record.type === RecordType.Focus
        ? FullSnapshotState.WaitingForFullSnapshot
        : FullSnapshotState.WaitingForMeta

    case FullSnapshotState.WaitingForFullSnapshot:
      return record.type === RecordType.FullSnapshot
        ? FullSnapshotState.HasFullSnapshot
        : FullSnapshotState.WaitingForMeta

    default:
      return currentState
  }
}
