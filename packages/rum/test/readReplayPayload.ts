import pako from 'pako'

import type { Payload } from '@datadog/browser-core'
import type { BrowserSegment, CreationReason } from '../src/types'
import type { BrowserSegmentMetadataAndSegmentSizes } from '../src/domain/segmentCollection'

export async function readReplayPayload(payload: Payload) {
  return {
    segment: await readSegmentFromReplayPayload(payload),
    metadata: await readMetadataFromReplayPayload(payload),
  }
}

function readSegmentFromReplayPayload(payload: Payload) {
  return readJsonBlob((payload.data as FormData).get('segment') as Blob, {
    decompress: true,
  }) as Promise<BrowserSegment>
}

export function readMetadataFromReplayPayload(payload: Payload) {
  const formData = payload.data as FormData
  if (!formData.has('event')) {
    // TODO remove this when replay_json_payload is enabled
    return {
      application: { id: formData.get('application.id') as string },
      session: { id: formData.get('session.id') as string },
      view: { id: formData.get('view.id') as string },
      start: Number(formData.get('start')),
      end: Number(formData.get('end')),
      records_count: Number(formData.get('records_count')),
      source: formData.get('source') as 'browser',
      creation_reason: formData.get('creation_reason') as CreationReason,
      raw_segment_size: Number(formData.get('raw_segment_size')),
      index_in_view: Number(formData.get('index_in_view')),
      has_full_snapshot: formData.get('has_full_snapshot') === 'true',
    } satisfies Omit<BrowserSegmentMetadataAndSegmentSizes, 'compressed_segment_size'> & {
      compressed_segment_size?: number
    }
  }

  return readJsonBlob((payload.data as FormData).get('event') as Blob) as Promise<BrowserSegmentMetadataAndSegmentSizes>
}

function readJsonBlob(blob: Blob, { decompress = false }: { decompress?: boolean } = {}) {
  // Safari Mobile 12 does not support blob.text() or blob.arrayBuffer() yet, so we need to use a
  // FileReader for now.
  // https://caniuse.com/mdn-api_blob_arraybuffer
  // https://caniuse.com/mdn-api_blob_text
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener('loadend', () => {
      const buffer = reader.result as ArrayBuffer
      const decompressed = decompress ? pako.inflate(buffer) : buffer
      const decoded = new TextDecoder().decode(decompressed)
      const deserialized = JSON.parse(decoded)
      resolve(deserialized)
    })
    reader.readAsArrayBuffer(blob)
  })
}
