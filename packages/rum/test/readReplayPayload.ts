import pako from 'pako'

import type { Payload } from '@datadog/browser-core'
import type { BrowserSegment } from '../src/types'
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
  return readJsonBlob((payload.data as FormData).get('event') as Blob) as Promise<BrowserSegmentMetadataAndSegmentSizes>
}

function readJsonBlob(blob: Blob, { decompress = false }: { decompress?: boolean } = {}) {
  // Safari Mobile 14 should support blob.text() or blob.arrayBuffer() but the APIs are not defined on the safari
  // provided by browserstack, so we still need to use a FileReader for now.
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
