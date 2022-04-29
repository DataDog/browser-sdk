import type { EndpointBuilder } from '@datadog/browser-core'
import { HttpRequest, objectEntries } from '@datadog/browser-core'
import type { SegmentMetadata } from '../types'

export const SEND_BEACON_BYTE_LENGTH_LIMIT = 60_000

export function send(
  endpointBuilder: EndpointBuilder,
  data: Uint8Array,
  metadata: SegmentMetadata,
  rawSegmentSize: number
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
  formData.append('raw_segment_size', rawSegmentSize.toString())

  const request = new HttpRequest(endpointBuilder, SEND_BEACON_BYTE_LENGTH_LIMIT)
  request.send(formData, data.byteLength)
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
