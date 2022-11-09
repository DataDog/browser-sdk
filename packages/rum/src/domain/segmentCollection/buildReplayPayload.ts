import type { Payload } from '@datadog/browser-core'
import { objectEntries } from '@datadog/browser-core'
import type { BrowserSegmentMetadata } from '../../types'

export function buildReplayPayload(
  data: Uint8Array,
  metadata: BrowserSegmentMetadata,
  rawSegmentBytesCount: number
): Payload {
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

  return { data: formData, bytesCount: data.byteLength }
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
