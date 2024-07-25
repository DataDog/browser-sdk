import type { DeflateEncoder, TimeStamp } from '@datadog/browser-core'
import { noop, setDebugMode, isIE, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { MockWorker } from '../../../test'
import type { CreationReason, BrowserRecord, SegmentContext, BrowserSegment, BrowserSegmentMetadata } from '../../types'
import { RecordType } from '../../types'
import { getReplayStats, resetReplayStats } from '../replayStats'
import { createDeflateEncoder } from '../deflate'
import type { AddRecordCallback, FlushCallback, Segment } from './segment'
import { createSegment } from './segment'

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
const ENCODED_META_BYTES_COUNT = 193 // this should stay accurate as long as less than 10 records are added
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

    registerCleanupTask(() => {
      setDebugMode(false)
    })
  })

  it('writes a segment', () => {
    const addRecordCallbackSpy = jasmine.createSpy<AddRecordCallback>()
    const flushCallbackSpy = jasmine.createSpy<FlushCallback>()
    const segment = createTestSegment()
    segment.addRecord(RECORD, addRecordCallbackSpy)

    worker.processAllMessages()
    expect(addRecordCallbackSpy).toHaveBeenCalledTimes(1)

    segment.flush(flushCallbackSpy)

    worker.processAllMessages()
    expect(addRecordCallbackSpy).toHaveBeenCalledTimes(1)
    expect(flushCallbackSpy).toHaveBeenCalledTimes(1)

    expect(parseSegment(flushCallbackSpy.calls.mostRecent().args[1].output)).toEqual({
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
    const addRecordCallbackSpy = jasmine.createSpy<AddRecordCallback>()
    const segment = createTestSegment()
    segment.addRecord(RECORD, addRecordCallbackSpy)
    worker.processAllMessages()
    expect(addRecordCallbackSpy).toHaveBeenCalledOnceWith(
      ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT
    )
  })

  it('calls the flush callback with metadata and encoder output as argument', () => {
    const flushCallbackSpy = jasmine.createSpy<FlushCallback>()
    const segment = createTestSegment()
    segment.addRecord(RECORD, noop)
    segment.flush(flushCallbackSpy)
    worker.processAllMessages()
    expect(flushCallbackSpy).toHaveBeenCalledOnceWith(
      {
        start: 10,
        end: 10,
        creation_reason: 'init',
        has_full_snapshot: false,
        index_in_view: 0,
        source: 'browser',
        records_count: 1,
        ...CONTEXT,
      },
      {
        output: jasmine.any(Uint8Array) as unknown as Uint8Array,
        outputBytesCount:
          ENCODED_SEGMENT_HEADER_BYTES_COUNT +
          ENCODED_RECORD_BYTES_COUNT +
          ENCODED_META_BYTES_COUNT +
          TRAILER_BYTES_COUNT,
        rawBytesCount: ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT + ENCODED_META_BYTES_COUNT,
        encoding: 'deflate',
      }
    )
  })

  it('resets the encoder when a segment is flushed', () => {
    const flushCallbackSpy = jasmine.createSpy<FlushCallback>()

    const segment1 = createTestSegment({ creationReason: 'init' })
    segment1.addRecord(RECORD, noop)
    segment1.flush(flushCallbackSpy)

    const segment2 = createTestSegment({ creationReason: 'segment_duration_limit' })
    segment2.addRecord(FULL_SNAPSHOT_RECORD, noop)
    segment2.flush(flushCallbackSpy)

    worker.processAllMessages()
    expect(parseSegment(flushCallbackSpy.calls.argsFor(0)[1].output).records.length).toBe(1)
    expect(parseSegment(flushCallbackSpy.calls.argsFor(1)[1].output).records.length).toBe(1)
  })

  it('throws when trying to flush an empty segment', () => {
    const segment = createTestSegment()
    expect(() => segment.flush(noop)).toThrowError('Empty segment flushed')
  })

  describe('metadata', () => {
    describe('when adding a record', () => {
      let segment: Segment
      beforeEach(() => {
        segment = createTestSegment()
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
        const segment = createTestSegment()
        segment.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment).has_full_snapshot).toEqual(false)
      })

      it('sets has_full_snapshot to true if a segment has a FullSnapshot', () => {
        const segment = createTestSegment()
        segment.addRecord(FULL_SNAPSHOT_RECORD, noop)
        expect(flushAndGetMetadata(segment).has_full_snapshot).toEqual(true)
      })

      it("doesn't overrides has_full_snapshot to false once it has been set to true", () => {
        const segment = createTestSegment()
        segment.addRecord(FULL_SNAPSHOT_RECORD, noop)
        segment.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment).has_full_snapshot).toEqual(true)
      })
    })

    describe('index_in_view', () => {
      it('increments index_in_view every time a segment is created for the same view', () => {
        const segment1 = createTestSegment()
        segment1.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment1).index_in_view).toBe(0)

        const segment2 = createTestSegment()
        segment2.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment2).index_in_view).toBe(1)

        const segment3 = createTestSegment()
        segment3.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment3).index_in_view).toBe(2)
      })

      it('resets segments_count when creating a segment for a new view', () => {
        const segment1 = createTestSegment()
        segment1.addRecord(RECORD, noop)
        expect(flushAndGetMetadata(segment1).index_in_view).toBe(0)

        const segment2 = createTestSegment({ context: { ...CONTEXT, view: { id: 'view-2' } } })
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

  describe('updates segment replay stats', () => {
    beforeEach(() => {
      resetReplayStats()
    })

    it('when creating a segment', () => {
      createTestSegment()
      worker.processAllMessages()
      expect(getReplayStats('b')).toEqual(
        jasmine.objectContaining({
          segments_count: 1,
          records_count: 0,
          segments_total_raw_size: 0,
        })
      )
    })

    it('when flushing a segment', () => {
      const segment = createTestSegment()
      segment.addRecord(RECORD, noop)
      segment.flush(noop)
      worker.processAllMessages()
      expect(getReplayStats('b')).toEqual(
        jasmine.objectContaining({
          segments_count: 1,
          segments_total_raw_size:
            ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT + ENCODED_META_BYTES_COUNT,
        })
      )
    })
  })

  function createTestSegment({
    context = CONTEXT,
    creationReason = 'init',
  }: {
    context?: SegmentContext
    creationReason?: CreationReason
  } = {}) {
    return createSegment({ encoder, context, creationReason })
  }
})

function parseSegment(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes)) as BrowserSegment
}
