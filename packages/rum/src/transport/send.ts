import type { EndpointBuilder } from '@datadog/browser-core'
import { HttpRequest, objectEntries } from '@datadog/browser-core'
import { SEGMENT_BYTES_LIMIT } from '../domain/segmentCollection'
import type { SegmentMetadata } from '../types'

export function send(
  endpointBuilder: EndpointBuilder,
  data: Uint8Array,
  metadata: SegmentMetadata,
  rawSegmentBytesCount: number,
  flushReason?: string
): void {
  const formData = new FormData()

  formData.append(
    'segment',
    new Blob([data], {
      type: 'application/octet-stream',
    }),
    `${metadata.session.id}-${metadata.start}`
  )

  toFormEntries(metadata, (key, value) => formData.append(key, value))
  formData.append('raw_segment_size', rawSegmentBytesCount.toString())

  const request = new HttpRequest(endpointBuilder, SEGMENT_BYTES_LIMIT)
  request.send(formData, data.byteLength, flushReason)
}

export function toFormEntries(input: object, onEntry: (key: string, value: string) => void, prefix = '') {
  objectEntries(input as { [key: string]: unknown }).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      toFormEntries(value, onEntry, `${prefix}${key}.`)
    } else {
      onEntry(`${prefix}${key}`, String(value))
    }
  })
}
