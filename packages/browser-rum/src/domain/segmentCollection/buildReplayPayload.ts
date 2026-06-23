import type { Payload, Uint8ArrayBuffer } from '@openobserve/browser-core'
import type { BrowserSegmentMetadata } from '../../types'
import type { SerializationMetric, SerializationStats } from '../record'

export type BrowserSegmentMetadataAndSegmentSizes = BrowserSegmentMetadata & {
  raw_segment_size: number
  compressed_segment_size: number
}

export type ReplayPayload = Payload & {
  cssText: SerializationMetric
  isFullSnapshot: boolean
  rawSize: number
  recordCount: number
  serializationDuration: SerializationMetric
}

export function buildReplayPayload(
  data: Uint8ArrayBuffer,
  metadata: BrowserSegmentMetadata,
  stats: SerializationStats,
  rawSegmentBytesCount: number
): ReplayPayload {
  const formData = new FormData()

  formData.append(
    'segment',
    new Blob([data], {
      type: 'application/octet-stream',
    }),
    `${metadata.session.id}-${metadata.start}`
  )

  const metadataAndSegmentSizes: BrowserSegmentMetadataAndSegmentSizes = {
    raw_segment_size: rawSegmentBytesCount,
    compressed_segment_size: data.byteLength,
    ...metadata,
  }

  const serializedMetadataAndSegmentSizes = JSON.stringify(metadataAndSegmentSizes)
  formData.append('event', new Blob([serializedMetadataAndSegmentSizes], { type: 'application/json' }))

  return {
    data: formData,
    bytesCount: data.byteLength,
    cssText: stats.cssText,
    isFullSnapshot: metadata.index_in_view === 0,
    rawSize: rawSegmentBytesCount,
    recordCount: metadata.records_count,
    serializationDuration: stats.serializationDuration,
  }
}
