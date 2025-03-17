import type { Encoder, EncoderResult } from '@flashcatcloud/browser-core'
import type { BrowserRecord, BrowserSegmentMetadata, CreationReason, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import * as replayStats from '../replayStats'

export type FlushReason = Exclude<CreationReason, 'init'> | 'stop'
export type FlushCallback = (metadata: BrowserSegmentMetadata, encoderResult: EncoderResult<Uint8Array>) => void
export type AddRecordCallback = (encodedBytesCount: number) => void

export interface Segment {
  addRecord: (record: BrowserRecord, callback: AddRecordCallback) => void
  flush: (callback: FlushCallback) => void
}

export function createSegment({
  context,
  creationReason,
  encoder,
}: {
  context: SegmentContext
  creationReason: CreationReason
  encoder: Encoder<Uint8Array>
}): Segment {
  let encodedBytesCount = 0
  const viewId = context.view.id
  const metadata: BrowserSegmentMetadata = {
    start: Infinity,
    end: -Infinity,
    creation_reason: creationReason,
    records_count: 0,
    has_full_snapshot: false,
    index_in_view: replayStats.getSegmentsCount(viewId),
    source: 'browser' as const,
    ...context,
  }

  replayStats.addSegment(viewId)

  function addRecord(record: BrowserRecord, callback: AddRecordCallback): void {
    metadata.start = Math.min(metadata.start, record.timestamp)
    metadata.end = Math.max(metadata.end, record.timestamp)
    metadata.records_count += 1
    metadata.has_full_snapshot ||= record.type === RecordType.FullSnapshot

    const prefix = encoder.isEmpty ? '{"records":[' : ','
    encoder.write(prefix + JSON.stringify(record), (additionalEncodedBytesCount) => {
      encodedBytesCount += additionalEncodedBytesCount
      callback(encodedBytesCount)
    })
  }

  function flush(callback: FlushCallback) {
    if (encoder.isEmpty) {
      throw new Error('Empty segment flushed')
    }

    encoder.write(`],${JSON.stringify(metadata).slice(1)}\n`)
    encoder.finish((encoderResult) => {
      replayStats.addWroteData(metadata.view.id, encoderResult.rawBytesCount)
      callback(metadata, encoderResult)
    })
  }

  return { addRecord, flush }
}
