import pako from 'pako'
import { addExperimentalFeatures, ExperimentalFeature, isIE, resetExperimentalFeatures } from '@datadog/browser-core'
import type { BrowserSegment, BrowserSegmentMetadata } from '../../types'
import { readReplayPayload } from '../../../test'
import { buildReplayPayload, toFormEntries } from './buildReplayPayload'

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

  beforeEach(() => {
    if (isIE()) {
      pending('no TextEncoder support')
    }
  })

  it('adds the segment as a file', async () => {
    const payload = buildReplayPayload(COMPRESSED_SEGMENT, METADATA, SERIALIZED_SEGMENT.length)
    const segmentEntry = (payload.data as FormData).get('segment')! as File
    expect(segmentEntry.size).toBe(COMPRESSED_SEGMENT.byteLength)
    expect(segmentEntry.name).toBe('xxx-1')
    expect(segmentEntry.type).toBe('application/octet-stream')
    const { segment } = await readReplayPayload(payload)
    expect(segment).toEqual(SEGMENT)
  })

  describe('with replay_json_payload experimental flag', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.REPLAY_JSON_PAYLOAD])
    })

    afterEach(() => {
      resetExperimentalFeatures()
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
  })

  describe('without replay_json_payload experimental flag', () => {
    it('adds the metadata plus the segment sizes as the `event` entry', () => {
      const payload = buildReplayPayload(COMPRESSED_SEGMENT, METADATA, SERIALIZED_SEGMENT.length)
      const formData = payload.data as FormData
      expect(formData.get('application.id')).toBe(METADATA.application.id)
      expect(formData.get('session.id')).toBe(METADATA.session.id)
      expect(formData.get('view.id')).toBe(METADATA.view.id)
      expect(formData.get('start')).toBe(String(METADATA.start))
      expect(formData.get('end')).toBe(String(METADATA.end))
      expect(formData.get('records_count')).toBe(String(METADATA.records_count))
      expect(formData.get('source')).toBe(METADATA.source)
      expect(formData.get('creation_reason')).toBe(METADATA.creation_reason)
      expect(formData.get('raw_segment_size')).toBe(String(SERIALIZED_SEGMENT.length))
    })
  })

  it('returns the approximate byte counts of the request', () => {
    const payload = buildReplayPayload(COMPRESSED_SEGMENT, METADATA, SERIALIZED_SEGMENT.length)
    expect(payload.bytesCount).toBe(COMPRESSED_SEGMENT.byteLength)
  })
})

describe('toFormEntries', () => {
  let callbackSpy: jasmine.Spy<(key: string, value: string) => void>
  beforeEach(() => {
    callbackSpy = jasmine.createSpy()
  })

  it('handles top level properties', () => {
    toFormEntries({ foo: 'bar', zig: 'zag' }, callbackSpy)
    expect(callbackSpy.calls.allArgs()).toEqual([
      ['foo', 'bar'],
      ['zig', 'zag'],
    ])
  })

  it('handles nested properties', () => {
    toFormEntries({ foo: { bar: 'baz', zig: { zag: 'zug' } } }, callbackSpy)
    expect(callbackSpy.calls.allArgs()).toEqual([
      ['foo.bar', 'baz'],
      ['foo.zig.zag', 'zug'],
    ])
  })

  it('converts values to string', () => {
    toFormEntries({ foo: 42, bar: null }, callbackSpy)
    expect(callbackSpy.calls.allArgs()).toEqual([
      ['foo', '42'],
      ['bar', 'null'],
    ])
  })
})
