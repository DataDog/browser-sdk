import { createNewEvent, DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts, RumSession, ViewContext } from '@datadog/browser-rum-core'
import { Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { MockWorker } from '../../test/utils'
import { SEND_BEACON_BYTE_LENGTH_LIMIT } from '../transport/send'
import { Segment } from './segment'
import { computeSegmentContext, doStartSegmentCollection, MAX_SEGMENT_DURATION } from './segmentCollection'

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }
const RECORD: Record = { type: RecordType.Load, timestamp: 10, data: {} }

const BEFORE_MAX_SEGMENT_DURATION = MAX_SEGMENT_DURATION * 0.9

describe('startSegmentCollection', () => {
  let stopErrorCollection: () => void

  function startSegmentCollection(context: SegmentContext | undefined) {
    const lifeCycle = new LifeCycle()
    const worker = new MockWorker()
    const eventEmitter = document.createElement('div')
    const sendSpy = jasmine.createSpy<(data: Uint8Array, meta: SegmentMeta) => void>()

    const { stop, addRecord } = doStartSegmentCollection(lifeCycle, () => context, sendSpy, worker, eventEmitter)
    stopErrorCollection = stop
    const segmentFlushSpy = spyOn(Segment.prototype, 'flush').and.callThrough()
    return {
      addRecord,
      eventEmitter,
      lifeCycle,
      segmentFlushSpy,
      worker,
      sendCurrentSegment: () => {
        // Make sure the segment is not empty
        addRecord(RECORD)
        // Flush segment
        lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
        worker.process()
        return sendSpy.calls.mostRecent().args[1]
      },
    }
  }

  afterEach(() => {
    jasmine.clock().uninstall()
    stopErrorCollection()
  })

  it('immediately starts a new segment', () => {
    const { addRecord, worker, segmentFlushSpy, sendCurrentSegment } = startSegmentCollection(CONTEXT)
    expect(worker.pendingData).toBe('')
    addRecord(RECORD)
    expect(worker.pendingData).toBe('{"records":[{"type":1,"timestamp":10,"data":{}}')
    expect(segmentFlushSpy).not.toHaveBeenCalled()
    expect(sendCurrentSegment().creation_reason).toBe('init')
  })

  it('flushes a segment', () => {
    const { lifeCycle, segmentFlushSpy, addRecord } = startSegmentCollection(CONTEXT)
    addRecord(RECORD)
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)

    expect(segmentFlushSpy).toHaveBeenCalledTimes(1)
  })

  it("ignores calls to addRecord if context can't be get", () => {
    const { worker, lifeCycle, addRecord, segmentFlushSpy } = startSegmentCollection(undefined)
    addRecord(RECORD)
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
    expect(worker.pendingData).toBe('')
    expect(segmentFlushSpy).not.toHaveBeenCalled()
  })

  describe('segment flush strategy', () => {
    afterEach(() => {
      restorePageVisibility()
    })

    it('flushes segment on unload', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
      expect(sendCurrentSegment().creation_reason).toBe('before_unload')
    })

    it('flushes segment on view change', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)
      expect(sendCurrentSegment().creation_reason).toBe('view_change')
    })

    it('flushes segment on session renew', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      expect(sendCurrentSegment().creation_reason).toBe('session_renewed')
    })

    it('flushes segment when the page become hidden', () => {
      setPageVisibility('hidden')
      const { eventEmitter, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))
      expect(sendCurrentSegment().creation_reason).toBe('visibility_hidden')
    })

    it('does not flush segment when the page become visible', () => {
      setPageVisibility('visible')
      const { eventEmitter, segmentFlushSpy, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))
      expect(segmentFlushSpy).not.toHaveBeenCalled()
      expect(sendCurrentSegment().creation_reason).not.toBe('visibility_hidden')
    })

    it('flushes segment when the current segment deflate size reaches SEND_BEACON_BYTE_LENGTH_LIMIT', () => {
      const { worker, addRecord, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      worker.deflatedSize = SEND_BEACON_BYTE_LENGTH_LIMIT
      addRecord(RECORD)
      worker.process()

      expect(sendCurrentSegment().creation_reason).toBe('max_size')
    })

    it('flushes a segment after MAX_SEGMENT_DURATION', () => {
      jasmine.clock().install()
      const { segmentFlushSpy, sendCurrentSegment, addRecord } = startSegmentCollection(CONTEXT)
      addRecord(RECORD)
      jasmine.clock().tick(MAX_SEGMENT_DURATION)

      expect(segmentFlushSpy).toHaveBeenCalledTimes(1)
      expect(sendCurrentSegment().creation_reason).toBe('max_duration')
    })

    it('does not flush a segment after MAX_SEGMENT_DURATION if a segment has been created in the meantime', () => {
      jasmine.clock().install()
      const { lifeCycle, segmentFlushSpy, sendCurrentSegment, addRecord } = startSegmentCollection(CONTEXT)
      addRecord(RECORD)
      jasmine.clock().tick(BEFORE_MAX_SEGMENT_DURATION)
      lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
      addRecord(RECORD)
      jasmine.clock().tick(BEFORE_MAX_SEGMENT_DURATION)

      expect(segmentFlushSpy).toHaveBeenCalledTimes(1)
      expect(sendCurrentSegment().creation_reason).not.toBe('max_duration')
    })
  })
})

describe('computeSegmentContext', () => {
  const DEFAULT_VIEW_CONTEXT: ViewContext = {
    session: { id: '456' },
    view: { id: '123', url: 'http://foo.com', referrer: 'http://bar.com' },
  }

  const DEFAULT_SESSION: RumSession = {
    getId: () => 'session-id',
    isTracked: () => true,
    isTrackedWithResource: () => true,
  }

  it('returns a segment context', () => {
    expect(computeSegmentContext('appid', DEFAULT_SESSION, mockParentContexts(DEFAULT_VIEW_CONTEXT))).toEqual({
      application: { id: 'appid' },
      session: { id: '456' },
      view: { id: '123' },
    })
  })

  it('returns undefined if there is no current view', () => {
    expect(computeSegmentContext('appid', DEFAULT_SESSION, mockParentContexts(undefined))).toBeUndefined()
  })

  it('returns undefined if there is no session id', () => {
    expect(
      computeSegmentContext(
        'appid',
        DEFAULT_SESSION,
        mockParentContexts({
          ...DEFAULT_VIEW_CONTEXT,
          session: { id: undefined },
        })
      )
    ).toBeUndefined()
  })

  it('returns undefined if the session is not tracked', () => {
    expect(
      computeSegmentContext(
        'appid',
        {
          ...DEFAULT_SESSION,
          isTracked: () => false,
        },
        mockParentContexts(DEFAULT_VIEW_CONTEXT)
      )
    ).toBeUndefined()
  })

  function mockParentContexts(view: ViewContext | undefined): ParentContexts {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return {
      findView() {
        return view
      },
    } as any
  }
})
