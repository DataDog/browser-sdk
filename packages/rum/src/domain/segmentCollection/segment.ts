import type { Encoder, EncoderResult } from '@datadog/browser-core'
import { assign } from '@datadog/browser-core'
import type { BrowserRecord, BrowserSegmentMetadata, CreationReason, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import * as replayStats from '../replayStats'

export type FlushReason = Exclude<CreationReason, 'init'> | 'stop'
export type FlushCallback = (metadata: BrowserSegmentMetadata, encoderResult: EncoderResult<Uint8Array>) => void
export type AddRecordCallback = (encodedBytesCount: number) => void

export class Segment {
  private metadata: BrowserSegmentMetadata
  private encodedBytesCount = 0

  constructor(
    private encoder: Encoder<Uint8Array>,
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

  addRecord(record: BrowserRecord, callback: AddRecordCallback): void {
    this.metadata.start = Math.min(this.metadata.start, record.timestamp)
    this.metadata.end = Math.max(this.metadata.end, record.timestamp)
    this.metadata.records_count += 1
    this.metadata.has_full_snapshot ||= record.type === RecordType.FullSnapshot

    const prefix = this.encoder.isEmpty ? '{"records":[' : ','
    this.encoder.write(prefix + JSON.stringify(record), (additionalEncodedBytesCount) => {
      this.encodedBytesCount += additionalEncodedBytesCount
      callback(this.encodedBytesCount)
    })
  }

  flush(callback: FlushCallback) {
    if (this.encoder.isEmpty) {
      throw new Error('Empty segment flushed')
    }

    this.encoder.write(`],${JSON.stringify(this.metadata).slice(1)}\n`)
    this.encoder.finish((encoderResult) => {
      replayStats.addWroteData(this.metadata.view.id, encoderResult.rawBytesCount)
      callback(this.metadata, encoderResult)
    })
  }
}
