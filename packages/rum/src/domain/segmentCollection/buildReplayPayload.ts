import type { Payload } from '@datadog/browser-core'
import { assign } from '@datadog/browser-core'
import type { BrowserSegmentMetadata } from '../../types'
import type { FlushReason } from './segment'

export type BrowserSegmentMetadataAndSegmentSizes = BrowserSegmentMetadata & {
  raw_segment_size: number
  compressed_segment_size: number
}

export interface RawReplayPayload {
  data: Uint8Array
  metadata: BrowserSegmentMetadata
  rawSegmentBytesCount: number
  flushReason: FlushReason | undefined
}

export function buildReplayPayload({ data, metadata, rawSegmentBytesCount }: RawReplayPayload): Payload {
  const formData = new FormData()

  formData.append(
    'segment',
    new Blob([data], {
      type: 'application/octet-stream',
    }),
    `${metadata.session.id}-${metadata.start}`
  )

  const metadataAndSegmentSizes: BrowserSegmentMetadataAndSegmentSizes = assign(
    {
      raw_segment_size: rawSegmentBytesCount,
      compressed_segment_size: data.byteLength,
    },
    metadata
  )
  const serializedMetadataAndSegmentSizes = JSON.stringify(metadataAndSegmentSizes)
  formData.append('event', new Blob([serializedMetadataAndSegmentSizes], { type: 'application/json' }))

  return { data: formData, bytesCount: data.byteLength }
}
