import type { TimeStamp } from '@datadog/browser-core'
import { noop, setDebugMode, isIE } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { MockWorker } from '../../../test'
import type { CreationReason, BrowserRecord, SegmentContext, BrowserSegment, BrowserSegmentMetadata } from '../../types'
import { RecordType } from '../../types'
import { getReplayStats, resetReplayStats } from '../replayStats'
import type { DeflateEncoder } from '../deflate'
import { DeflateEncoderStreamId, createDeflateEncoder } from '../deflate'
import { Segment } from './segment'

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }
const RECORD_TIMESTAMP = 10 as TimeStamp
const RECORD: BrowserRecord = { type: RecordType.ViewEnd, timestamp: RECORD_TIMESTAMP }
const FULL_SNAPSHOT_RECORD: BrowserRecord = {
  type: RecordType.FullSnapshot,
  timestamp: RECORD_TIMESTAMP,
  data: {} as any,
}
const ENCODED_SEGMENT_HEADER_BYTES_COUNT = 12 // {"records":[
const ENCODED_RECORD_BYTES_COUNT = 25
const ENCODED_FULL_SNAPSHOT_RECORD_BYTES_COUNT = 35
const ENCODED_META_BYTES_COUNT = 192 // this should stay accurate as long as less than 10 records are added
const TRAILER_BYTES_COUNT = 1

describe('Segment', () => {
  const configuration = {} as RumConfiguration
  let worker: MockWorker
  let encoder: DeflateEncoder

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    worker = new MockWorker()
    encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
    setDebugMode(true)
    resetReplayStats()
  })

  afterEach(() => {
    setDebugMode(false)
  })

  it('writes a segment', () => {
    const addRecordCallbackSpy = jasmine.createSpy<() => void>()
    const flushCallbackSpy = jasmine.createSpy<(metadata: BrowserSegmentMetadata) => void>()
    const segment = createSegment()
    segment.addRecord(RECORD, addRecordCallbackSpy)

    worker.processAllMessages()
    expect(addRecordCallbackSpy).toHaveBeenCalledTimes(1)

    segment.flush(flushCallbackSpy)

    worker.processAllMessages()
    expect(addRecordCallbackSpy).toHaveBeenCalledTimes(1)
    expect(flushCallbackSpy).toHaveBeenCalledTimes(1)

    expect(parseSegment(encoder.encodedBytes)).toEqual({
      source: 'browser' as const,
      creation_reason: 'init' as const,
      end: 10,
      has_full_snapshot: false,
      records: [
        {
          timestamp: RECORD_TIMESTAMP,
          type: RecordType.ViewEnd,
        },
      ],
      records_count: 1,
      start: 10,
      index_in_view: 0,
      ...CONTEXT,
    })
  })

  it('compressed bytes count is updated when a record is added', () => {
    const segment = createSegment()
    segment.addRecord(RECORD, noop)
    worker.processAllMessages()
    expect(encoder.encodedBytesCount).toBe(
      ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT + TRAILER_BYTES_COUNT
    )
  })

  it('calls the flush callback with metadata as argument', () => {
    const flushCallbackSpy = jasmine.createSpy<(metadata: BrowserSegmentMetadata) => void>()
    const segment = createSegment()
    segment.addRecord(RECORD, noop)
    segment.flush(flushCallbackSpy)
    worker.processAllMessages()
    expect(flushCallbackSpy).toHaveBeenCalledOnceWith({
      start: 10,
      end: 10,
      creation_reason: 'init',
      has_full_snapshot: false,
      index_in_view: 0,
      source: 'browser',
      records_count: 1,
      ...CONTEXT,
    })
  })

  it('resets the encoder when a segment is flushed', () => {
    const encodedBytesCounts: number[] = []

    const segment1 = createSegment({ creationReason: 'init' })
    segment1.addRecord(RECORD, () => encodedBytesCounts.push(encoder.encodedBytesCount))
    segment1.flush(noop)

    const segment2 = createSegment({ creationReason: 'segment_duration_limit' })
    segment2.addRecord(FULL_SNAPSHOT_RECORD, () => encodedBytesCounts.push(encoder.encodedBytesCount))
    segment2.flush(noop)

    worker.processAllMessages()
    expect(encodedBytesCounts).toEqual([
      ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT + TRAILER_BYTES_COUNT,
      ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_FULL_SNAPSHOT_RECORD_BYTES_COUNT + TRAILER_BYTES_COUNT,
    ])
  })

  it('throws when trying to flush an empty segment', () => {
    const segment = createSegment()
    expect(() => segment.flush(noop)).toThrowError('Empty segment flushed')
  })

  describe('metadata', () => {
    describe('when adding a record', () => {
      let segment: Segment
      beforeEach(() => {
        segment = createSegment()
        segment.addRecord({ type: RecordType.ViewEnd, timestamp: 10 as TimeStamp }, noop)
        segment.addRecord({ type: RecordType.ViewEnd, timestamp: 15 as TimeStamp }, noop)
      })

      it('does increment records_count', () => {
        expect(flushAndGetMetadata(segment).records_count).toBe(2)
      })

      it('does not change start timestamp when receiving a later record', () => {
        expect(flushAndGetMetadata(segment).start).toBe(10)
      })

      it('does change the start timestamp when receiving an earlier record', () => {
        segment.addRecord({ type: RecordType.ViewEnd, timestamp: 5 as TimeStamp }, noop)
        expect(flushAndGetMetadata(segment).start).toBe(5)
      })

      it('does increase end timestamp when receiving a later record', () => {
        expect(flushAndGetMetadata(segment).end).toBe(15)
      })

      it('does not change the end timestamp when receiving an earlier record', () => {
        segment.addRecord({ type: RecordType.ViewEnd, timestamp: 5 as TimeStamp }, noop)
        expect(flushAndGetMetadata(segment).end).toBe(15)
      })
    })

    describe('has_full_snapshot', () => {
      it('sets has_full_snapshot to false if a segment has a no FullSnapshot', () => {
        const segment = createSegment()
        segment.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment).has_full_snapshot).toEqual(false)
      })

      it('sets has_full_snapshot to true if a segment has a FullSnapshot', () => {
        const segment = createSegment()
        segment.addRecord(FULL_SNAPSHOT_RECORD, noop)
        expect(flushAndGetMetadata(segment).has_full_snapshot).toEqual(true)
      })

      it("doesn't overrides has_full_snapshot to false once it has been set to true", () => {
        const segment = createSegment()
        segment.addRecord(FULL_SNAPSHOT_RECORD, noop)
        segment.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment).has_full_snapshot).toEqual(true)
      })
    })

    describe('index_in_view', () => {
      it('increments index_in_view every time a segment is created for the same view', () => {
        const segment1 = createSegment()
        segment1.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment1).index_in_view).toBe(0)

        const segment2 = createSegment()
        segment2.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment2).index_in_view).toBe(1)

        const segment3 = createSegment()
        segment3.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment3).index_in_view).toBe(2)
      })

      it('resets segments_count when creating a segment for a new view', () => {
        const segment1 = createSegment()
        segment1.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment1).index_in_view).toBe(0)

        const segment2 = createSegment({ context: { ...CONTEXT, view: { id: 'view-2' } } })
        segment2.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment2).index_in_view).toBe(0)
      })
    })

    function flushAndGetMetadata(segment: Segment) {
      let metadata: BrowserSegmentMetadata
      segment.flush((_metadata) => {
        metadata = _metadata
      })
      worker.processAllMessages()
      return metadata!
    }
  })

  describe('updates replay stats', () => {
    beforeEach(() => {
      resetReplayStats()
    })

    it('when creating a segment', () => {
      createSegment()
      worker.processAllMessages()
      expect(getReplayStats('b')).toEqual({
        segments_count: 1,
        records_count: 0,
        segments_total_raw_size: 0,
      })
    })

    it('when adding records', () => {
      const segment = createSegment()
      segment.addRecord(FULL_SNAPSHOT_RECORD, noop)
      segment.addRecord(RECORD, noop)
      worker.processAllMessages()
      expect(getReplayStats('b')).toEqual({
        segments_count: 1,
        records_count: 2,
        segments_total_raw_size: 0,
      })
    })

    it('when flushing a segment', () => {
      const segment = createSegment()
      segment.addRecord(FULL_SNAPSHOT_RECORD, noop)
      segment.flush(noop)
      worker.processAllMessages()
      expect(getReplayStats('b')).toEqual({
        segments_count: 1,
        records_count: 1,
        segments_total_raw_size:
          ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_FULL_SNAPSHOT_RECORD_BYTES_COUNT + ENCODED_META_BYTES_COUNT,
      })
    })
  })

  function createSegment({
    context = CONTEXT,
    creationReason = 'init',
  }: {
    context?: SegmentContext
    creationReason?: CreationReason
  } = {}) {
    return new Segment(encoder, context, creationReason)
  }
})

function parseSegment(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes)) as BrowserSegment
}
