import { HttpRequest, objectEntries } from '@datadog/browser-core'
import { SegmentMeta } from '../types'

export const SEND_BEACON_BYTE_LENGTH_LIMIT = 60_000

export function send(endpointUrl: string, data: Uint8Array, meta: SegmentMeta, segmentSize: number): void {
  const formData = new FormData()

  formData.set(
    'segment',
    new Blob([data], {
      type: 'application/octet-stream',
    }),
    `${meta.session.id}-${meta.start}`
  )

  toFormEntries(meta, (key, value) => formData.set(key, value))
  formData.set('raw_segment_size', segmentSize.toString(10))

  const request = new HttpRequest(endpointUrl, SEND_BEACON_BYTE_LENGTH_LIMIT)
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
