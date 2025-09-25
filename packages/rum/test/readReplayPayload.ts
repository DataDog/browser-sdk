import type { Payload } from '@datadog/browser-core'
import type { BrowserSegment } from '../src/types'
import type { BrowserSegmentMetadataAndSegmentSizes } from '../src/domain/segmentCollection'
import { readFormData } from '../../core/test'

export function readReplayPayload(payload: Payload) {
  return readFormData<{
    segment: BrowserSegment
    event: BrowserSegmentMetadataAndSegmentSizes
  }>(payload.data as FormData)
}

export async function readMetadataFromReplayPayload(payload: Payload) {
  return (await readReplayPayload(payload)).event
}
