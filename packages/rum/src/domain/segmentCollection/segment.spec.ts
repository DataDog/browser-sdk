import type { TimeStamp } from '@datadog/browser-core'
import { noop, setDebugMode, display, isIE } from '@datadog/browser-core'
import { MockWorker, parseSegment } from '../../../test/utils'
import type { CreationReason, BrowserRecord, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import { getReplayStats, resetReplayStats } from '../replayStats'
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
const ENCODED_SEPARATOR_BYTES_COUNT = 1 // ,
const ENCODED_META_BYTES_COUNT = 192 // this should stay accurate as long as less than 10 records are added

describe('Segment', () => {
  let worker: MockWorker

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    worker = new MockWorker()
    setDebugMode(true)
    resetReplayStats()
  })

  afterEach(() => {
    setDebugMode(false)
  })

  it('writes a segment', () => {
    const onWroteSpy = jasmine.createSpy<(compressedSegmentBytesCount: number) => void>()
    const onFlushedSpy = jasmine.createSpy<(data: Uint8Array) => void>()
    const segment = createSegment({ onWrote: onWroteSpy, onFlushed: onFlushedSpy })

    worker.processAllMessages()
    expect(onWroteSpy).toHaveBeenCalledTimes(1)
    expect(onFlushedSpy).not.toHaveBeenCalled()

    segment.flush()

    worker.processAllMessages()
    expect(onWroteSpy).toHaveBeenCalledTimes(1)
    expect(onFlushedSpy).toHaveBeenCalledTimes(1)

    expect(parseSegment(onFlushedSpy.calls.mostRecent().args[0])).toEqual({
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

  it('is marked as flushed when flush() is called', () => {
    const segment = createSegment()
    expect(segment.isFlushed).toBe(false)
    segment.flush()
    expect(segment.isFlushed).toBe(true)
  })

  it('calls the onWrote callback when data is written', () => {
    const onWroteSpy = jasmine.createSpy<(compressedSegmentBytesCount: number) => void>()
    createSegment({ onWrote: onWroteSpy })
    worker.processAllMessages()
    expect(onWroteSpy).toHaveBeenCalledOnceWith(ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT)
  })

  it('calls the onFlushed callback when data is flush', () => {
    const onFlushedSpy = jasmine.createSpy<(data: Uint8Array, rawSegmentBytesCount: number) => void>()
    const segment = createSegment({ onFlushed: onFlushedSpy })
    segment.flush()
    worker.processAllMessages()
    expect(onFlushedSpy).toHaveBeenCalledOnceWith(jasmine.any(Uint8Array), jasmine.any(Number))
  })

  it('calls the onWrote callbacks separately when two Segment are used', () => {
    const onWroteSpy1 = jasmine.createSpy<(compressedSegmentBytesCount: number) => void>()
    const onWroteSpy2 = jasmine.createSpy<(compressedSegmentBytesCount: number) => void>()
    const segment1 = createSegment({ creationReason: 'init', onWrote: onWroteSpy1 })
    segment1.flush()
    const segment2 = createSegment({
      creationReason: 'segment_duration_limit',
      initialRecord: FULL_SNAPSHOT_RECORD,
      onWrote: onWroteSpy2,
    })
    segment2.flush()
    worker.processAllMessages()
    expect(onWroteSpy1).toHaveBeenCalledOnceWith(ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT)
    expect(onWroteSpy2).toHaveBeenCalledOnceWith(
      ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_FULL_SNAPSHOT_RECORD_BYTES_COUNT
    )
  })

  it('unsubscribes from the worker if a flush() response fails and another Segment is used', () => {
    const displaySpy = spyOn(display, 'debug')
    const writer1 = createSegment()
    writer1.flush()
    createSegment()
    worker.processNextMessage() // process the segment1 initial record
    worker.dropNextMessage() // drop the segment1 flush
    worker.processAllMessages()
    expect(worker.messageListenersCount).toBe(1)
    expect(displaySpy).toHaveBeenCalledWith(
      '[MONITOR]',
      "Segment did not receive a 'flush' response before being replaced.",
      undefined
    )
  })

  describe('metadata', () => {
    describe('when adding a record', () => {
      let segment: Segment
      beforeEach(() => {
        segment = createSegment()
        segment.addRecord({ type: RecordType.ViewEnd, timestamp: 15 as TimeStamp })
      })
      it('does increment records_count', () => {
        expect(segment.metadata.records_count).toBe(2)
      })
      it('does not change start timestamp when receiving a later record', () => {
        expect(segment.metadata.start).toBe(10)
      })
      it('does change the start timestamp when receiving an earlier record', () => {
        segment.addRecord({ type: RecordType.ViewEnd, timestamp: 5 as TimeStamp })
        expect(segment.metadata.start).toBe(5)
      })
      it('does increase end timestamp when receiving a later record', () => {
        expect(segment.metadata.end).toBe(15)
      })
      it('does not change the end timestamp when receiving an earlier record', () => {
        segment.addRecord({ type: RecordType.ViewEnd, timestamp: 5 as TimeStamp })
        expect(segment.metadata.end).toBe(15)
      })
    })

    describe('has_full_snapshot', () => {
      it('sets has_full_snapshot to true if a segment has a FullSnapshot', () => {
        const segment = createSegment()
        segment.addRecord(FULL_SNAPSHOT_RECORD)
        expect(segment.metadata.has_full_snapshot).toEqual(true)
      })

      it("doesn't overrides has_full_snapshot to false once it has been set to true", () => {
        const segment = createSegment()
        segment.addRecord(FULL_SNAPSHOT_RECORD)
        segment.addRecord(RECORD)
        expect(segment.metadata.has_full_snapshot).toEqual(true)
      })
    })

    describe('index_in_view', () => {
      it('increments index_in_view every time a segment is created for the same view', () => {
        expect(createSegment().metadata.index_in_view).toBe(0)
        expect(createSegment().metadata.index_in_view).toBe(1)
        expect(createSegment().metadata.index_in_view).toBe(2)
      })

      it('resets segments_count when creating a segment for a new view', () => {
        expect(createSegment().metadata.index_in_view).toBe(0)
        expect(createSegment({ context: { ...CONTEXT, view: { id: 'view-2' } } }).metadata.index_in_view).toBe(0)
      })
    })
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
        records_count: 1,
        segments_total_raw_size: ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_RECORD_BYTES_COUNT,
      })
    })

    it('when flushing a segment', () => {
      const segment = createSegment({ initialRecord: FULL_SNAPSHOT_RECORD })
      segment.flush()
      worker.processAllMessages()
      expect(getReplayStats('b')).toEqual({
        segments_count: 1,
        records_count: 1,
        segments_total_raw_size:
          ENCODED_SEGMENT_HEADER_BYTES_COUNT + ENCODED_FULL_SNAPSHOT_RECORD_BYTES_COUNT + ENCODED_META_BYTES_COUNT,
      })
    })

    it('when adding a record', () => {
      const segment = createSegment({ initialRecord: FULL_SNAPSHOT_RECORD })
      segment.addRecord(RECORD)
      worker.processAllMessages()
      expect(getReplayStats('b')).toEqual({
        segments_count: 1,
        records_count: 2,
        segments_total_raw_size:
          ENCODED_SEGMENT_HEADER_BYTES_COUNT +
          ENCODED_FULL_SNAPSHOT_RECORD_BYTES_COUNT +
          ENCODED_SEPARATOR_BYTES_COUNT +
          ENCODED_RECORD_BYTES_COUNT,
      })
    })
  })

  function createSegment({
    context = CONTEXT,
    initialRecord = RECORD,
    creationReason = 'init',
    onWrote = noop,
    onFlushed = noop,
  }: {
    context?: SegmentContext
    initialRecord?: BrowserRecord
    creationReason?: CreationReason
    onWrote?: (compressedSegmentBytesCount: number) => void
    onFlushed?: (data: Uint8Array, rawBytesCount: number) => void
  } = {}) {
    return new Segment(worker, context, creationReason, initialRecord, onWrote, onFlushed)
  }
})
