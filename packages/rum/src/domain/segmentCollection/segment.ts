import type { Encoder, EncoderResult, Uint8ArrayBuffer } from '@datadog/browser-core'
import type { BrowserRecord, BrowserSegmentMetadata, CreationReason, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import * as replayStats from '../replayStats'
import type { SerializationStats } from '../record'
import { aggregateSerializationStats, createSerializationStats } from '../record'

export type FlushReason = Exclude<CreationReason, 'init'> | 'stop'
export type FlushCallback = (
  metadata: BrowserSegmentMetadata,
  stats: SerializationStats,
  encoderResult: EncoderResult<Uint8ArrayBuffer>
) => void
export type AddRecordCallback = (encodedBytesCount: number) => void

export interface Segment {
  addRecord: (record: BrowserRecord, stats: SerializationStats | undefined, callback: AddRecordCallback) => void
  flush: (callback: FlushCallback) => void
}

export function createSegment({
  context,
  creationReason,
  encoder,
}: {
  context: SegmentContext
  creationReason: CreationReason
  encoder: Encoder<Uint8ArrayBuffer>
}): Segment {
  let encodedBytesCount = 0
  const viewId = context.view.id
  const indexInView = replayStats.getSegmentsCount(viewId)
  const metadata: BrowserSegmentMetadata = {
    start: Infinity,
    end: -Infinity,
    creation_reason: creationReason,
    records_count: 0,
    has_full_snapshot: false,
    index_in_view: indexInView,
    source: 'browser' as const,
    ...context,
  }

  const serializationStats = createSerializationStats()
  replayStats.addSegment(viewId)

  function addRecord(record: BrowserRecord, stats: SerializationStats | undefined, callback: AddRecordCallback): void {
    metadata.start = Math.min(metadata.start, record.timestamp)
    metadata.end = Math.max(metadata.end, record.timestamp)
    metadata.records_count += 1
    metadata.has_full_snapshot ||= record.type === RecordType.FullSnapshot

    if (stats) {
      aggregateSerializationStats(serializationStats, stats)
    }

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
      callback(metadata, serializationStats, encoderResult)
    })
  }

  return { addRecord, flush }
}
