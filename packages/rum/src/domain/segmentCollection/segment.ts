import { assign, sendToExtension } from '@datadog/browser-core'
import type { BrowserRecord, BrowserSegmentMetadata, CreationReason, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import * as replayStats from '../replayStats'
import type { DeflateEncoder } from '../deflate'

export type FlushReason = Exclude<CreationReason, 'init'> | 'stop'

export class Segment {
  private metadata: BrowserSegmentMetadata

  constructor(
    private encoder: DeflateEncoder,
    context: SegmentContext,
    creationReason: CreationReason
  ) {
    const viewId = context.view.id

    this.metadata = assign(
      {
        start: Infinity,
        end: -Infinity,
        creation_reason: creationReason,
        records_count: 0,
        has_full_snapshot: false,
        index_in_view: replayStats.getSegmentsCount(viewId),
        source: 'browser' as const,
      },
      context
    )

    replayStats.addSegment(viewId)
  }

  addRecord(record: BrowserRecord, callback: () => void): void {
    this.metadata.start = Math.min(this.metadata.start, record.timestamp)
    this.metadata.end = Math.max(this.metadata.end, record.timestamp)
    this.metadata.records_count += 1
    this.metadata.has_full_snapshot ||= record.type === RecordType.FullSnapshot

    sendToExtension('record', { record, segment: this.metadata })
    replayStats.addRecord(this.metadata.view.id)

    const prefix = this.metadata.records_count === 1 ? '{"records":[' : ','
    this.encoder.write(prefix + JSON.stringify(record), callback)
  }

  flush(callback: (metadata: BrowserSegmentMetadata) => void) {
    if (this.metadata.records_count === 0) {
      throw new Error('Empty segment flushed')
    }

    this.encoder.write(`],${JSON.stringify(this.metadata).slice(1)}\n`, () => {
      replayStats.addWroteData(this.metadata.view.id, this.encoder.rawBytesCount)
      callback(this.metadata)
    })
    this.encoder.reset()
  }
}
