import pako from 'pako'
import type { BrowserSegment, BrowserSegmentMetadata } from '../../types'
import { readReplayPayload } from '../../../test'
import { buildReplayPayload } from './buildReplayPayload'

describe('buildReplayPayload', () => {
  const SEGMENT = { foo: 'bar' } as unknown as BrowserSegment
  const SERIALIZED_SEGMENT = JSON.stringify(SEGMENT)
  const COMPRESSED_SEGMENT = pako.deflate(SERIALIZED_SEGMENT)
  const METADATA: BrowserSegmentMetadata = {
    application: { id: 'xxx' },
    session: { id: 'xxx' },
    view: { id: 'xxx' },
    start: 1,
    end: 2,
    records_count: 10,
    source: 'browser',
    creation_reason: 'init',
  }
  const METADATA_AND_SEGMENT_SIZES = {
    ...METADATA,
    raw_segment_size: SERIALIZED_SEGMENT.length,
    compressed_segment_size: COMPRESSED_SEGMENT.byteLength,
  }

  it('adds the segment as a file', async () => {
    const payload = buildReplayPayload(COMPRESSED_SEGMENT, METADATA, SERIALIZED_SEGMENT.length)
    const segmentEntry = (payload.data as FormData).get('segment')! as File
    expect(segmentEntry.size).toBe(COMPRESSED_SEGMENT.byteLength)
    expect(segmentEntry.name).toBe('xxx-1')
    expect(segmentEntry.type).toBe('application/octet-stream')
    const { segment } = await readReplayPayload(payload)
    expect(segment).toEqual(SEGMENT)
  })

  it('adds the metadata plus the segment sizes as the `event` entry', async () => {
    const payload = buildReplayPayload(COMPRESSED_SEGMENT, METADATA, SERIALIZED_SEGMENT.length)
    const eventEntry = (payload.data as FormData).get('event')! as File
    expect(eventEntry.size).toBe(JSON.stringify(METADATA_AND_SEGMENT_SIZES).length)
    expect(eventEntry.name).toBe('blob')
    expect(eventEntry.type).toBe('application/json')
    const { metadata } = await readReplayPayload(payload)
    expect(metadata).toEqual(METADATA_AND_SEGMENT_SIZES)
  })

  it('returns the approximate byte counts of the request', () => {
    const payload = buildReplayPayload(COMPRESSED_SEGMENT, METADATA, SERIALIZED_SEGMENT.length)
    expect(payload.bytesCount).toBe(COMPRESSED_SEGMENT.byteLength)
  })
})
