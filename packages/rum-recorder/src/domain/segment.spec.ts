import { noop, setDebugMode } from '@datadog/browser-core'
import { isIE } from '../../../core/test/specHelper'
import { MockWorker, parseSegment } from '../../test/utils'
import { Record, RecordType, SegmentContext } from '../types'
import { Segment } from './segment'

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }

const RECORD: Record = { type: RecordType.ViewEnd, timestamp: 10 }
const FULL_SNAPSHOT_RECORD: Record = { type: RecordType.FullSnapshot, timestamp: 10, data: {} as any }
const ENCODED_SEGMENT_HEADER_SIZE = 12 // {"records":[
const ENCODED_RECORD_SIZE = 25
const ENCODED_FULL_SNAPSHOT_RECORD_SIZE = 35

describe('Segment', () => {
  let worker: MockWorker

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    worker = new MockWorker()
    setDebugMode(true)
  })

  afterEach(() => {
    setDebugMode(false)
  })

  it('writes a segment', () => {
    const onWroteSpy = jasmine.createSpy<(size: number) => void>()
    const onFlushedSpy = jasmine.createSpy<(data: Uint8Array) => void>()
    const segment = new Segment(worker, CONTEXT, 'init', RECORD, onWroteSpy, onFlushedSpy)

    worker.processAllMessages()
    expect(onWroteSpy).toHaveBeenCalledTimes(1)
    expect(onFlushedSpy).not.toHaveBeenCalled()

    segment.flush()

    worker.processAllMessages()
    expect(onWroteSpy).toHaveBeenCalledTimes(1)
    expect(onFlushedSpy).toHaveBeenCalledTimes(1)

    expect(parseSegment(onFlushedSpy.calls.mostRecent().args[0])).toEqual({
      creation_reason: 'init' as const,
      end: 10,
      has_full_snapshot: false,
      records: [
        {
          timestamp: 10,
          type: RecordType.ViewEnd,
        },
      ],
      records_count: 1,
      start: 10,
      ...CONTEXT,
    })
  })

  it('adjusts meta when adding a record', () => {
    const segment = new Segment(worker, CONTEXT, 'init', RECORD, noop, noop)
    segment.addRecord({ type: RecordType.ViewEnd, timestamp: 15 })
    expect(segment.meta).toEqual({
      creation_reason: 'init',
      end: 15,
      has_full_snapshot: false,
      records_count: 2,
      start: 10,
      ...CONTEXT,
    })
  })

  it('is marked as flushed when flush() is called', () => {
    const segment = new Segment(worker, CONTEXT, 'init', RECORD, noop, noop)
    expect(segment.isFlushed).toBe(false)
    segment.flush()
    expect(segment.isFlushed).toBe(true)
  })

  it('sets has_full_snapshot to true if a segment has a FullSnapshot', () => {
    const segment = new Segment(worker, CONTEXT, 'init', RECORD, noop, noop)
    segment.addRecord(FULL_SNAPSHOT_RECORD)
    expect(segment.meta.has_full_snapshot).toEqual(true)
  })

  it("doesn't overrides has_full_snapshot to false once it has been set to true", () => {
    const segment = new Segment(worker, CONTEXT, 'init', RECORD, noop, noop)
    segment.addRecord(FULL_SNAPSHOT_RECORD)
    segment.addRecord(RECORD)
    expect(segment.meta.has_full_snapshot).toEqual(true)
  })

  it('calls the onWrote callback when data is written', () => {
    const onWroteSpy = jasmine.createSpy<(size: number) => void>()
    new Segment(worker, CONTEXT, 'init', RECORD, onWroteSpy, noop)
    worker.processAllMessages()
    expect(onWroteSpy).toHaveBeenCalledOnceWith(ENCODED_SEGMENT_HEADER_SIZE + ENCODED_RECORD_SIZE)
  })

  it('calls the onFlushed callback when data is flush', () => {
    const onFlushedSpy = jasmine.createSpy<(data: Uint8Array) => void>()
    const segment = new Segment(worker, CONTEXT, 'init', RECORD, noop, onFlushedSpy)
    segment.flush()
    worker.processAllMessages()
    expect(onFlushedSpy).toHaveBeenCalledOnceWith(jasmine.any(Uint8Array))
  })

  it('calls the onWrote callbacks separately when two Segment are used', () => {
    const onWroteSpy1 = jasmine.createSpy<(size: number) => void>()
    const onWroteSpy2 = jasmine.createSpy<(size: number) => void>()
    const segment1 = new Segment(worker, CONTEXT, 'init', RECORD, onWroteSpy1, noop)
    segment1.flush()
    const segment2 = new Segment(worker, CONTEXT, 'max_duration', FULL_SNAPSHOT_RECORD, onWroteSpy2, noop)
    segment2.flush()
    worker.processAllMessages()
    expect(onWroteSpy1).toHaveBeenCalledOnceWith(ENCODED_SEGMENT_HEADER_SIZE + ENCODED_RECORD_SIZE)
    expect(onWroteSpy2).toHaveBeenCalledOnceWith(ENCODED_SEGMENT_HEADER_SIZE + ENCODED_FULL_SNAPSHOT_RECORD_SIZE)
  })

  it('unsubscribes from the worker if a flush() response fails and another Segment is used', () => {
    const consoleSpy = spyOn(console, 'log')
    const writer1 = new Segment(worker, CONTEXT, 'init', FULL_SNAPSHOT_RECORD, noop, noop)
    writer1.flush()
    new Segment(worker, CONTEXT, 'init', FULL_SNAPSHOT_RECORD, noop, noop)
    worker.processNextMessage() // process the segment1 initial record
    worker.dropNextMessage() // drop the segment1 flush
    worker.processAllMessages()
    expect(worker.listenersCount).toBe(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[MONITORING MESSAGE]',
      "Segment did not receive a 'flush' response before being replaced."
    )
  })
})
