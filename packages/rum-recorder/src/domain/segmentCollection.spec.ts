import { createNewEvent, DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts, RumSession, ViewContext } from '@datadog/browser-rum-core'
import { Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { Segment } from './segment'
import { doGetSegmentContext, doStartSegmentCollection, MAX_SEGMENT_DURATION } from './segmentCollection'

import { MockWorker } from '../../test/utils'
import { SEND_BEACON_BYTE_LENGTH_LIMIT } from '../transport/send'

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
    const segmentCompleteSpy = spyOn(Segment.prototype, 'complete').and.callThrough()
    return {
      addRecord,
      eventEmitter,
      lifeCycle,
      segmentCompleteSpy,
      worker,
      sendCurrentSegment() {
        // Make sure the segment is not empty
        addRecord(RECORD)
        // Renew segment
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
    const { addRecord, worker, segmentCompleteSpy, sendCurrentSegment } = startSegmentCollection(CONTEXT)
    expect(worker.pendingData).toBe('')
    addRecord(RECORD)
    expect(worker.pendingData).toBe('{"records":[{"type":1,"timestamp":10,"data":{}}')
    expect(segmentCompleteSpy).not.toHaveBeenCalled()
    expect(sendCurrentSegment().creation_reason).toBe('init')
  })

  it('completes a segment when renewing it', () => {
    const { lifeCycle, segmentCompleteSpy } = startSegmentCollection(CONTEXT)
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
    expect(segmentCompleteSpy).toHaveBeenCalledTimes(1)
  })

  it("ignores calls to addRecord if context can't be get", () => {
    const { worker, lifeCycle, addRecord, segmentCompleteSpy } = startSegmentCollection(undefined)
    addRecord(RECORD)
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
    expect(worker.pendingData).toBe('')
    expect(segmentCompleteSpy).not.toHaveBeenCalled()
  })

  describe('segment renewal', () => {
    afterEach(() => {
      restorePageVisibility()
    })

    it('renews segment on unload', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
      expect(sendCurrentSegment().creation_reason).toBe('before_unload')
    })

    it('renews segment on view change', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)
      expect(sendCurrentSegment().creation_reason).toBe('view_change')
    })

    it('renews segment on session renew', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      expect(sendCurrentSegment().creation_reason).toBe('session_renewed')
    })

    it('renews segment when the page become hidden', () => {
      setPageVisibility('hidden')
      const { eventEmitter, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))
      expect(sendCurrentSegment().creation_reason).toBe('visibility_change')
    })

    it('does not renew segment when the page become visible', () => {
      setPageVisibility('visible')
      const { eventEmitter, segmentCompleteSpy, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))
      expect(segmentCompleteSpy).not.toHaveBeenCalled()
      expect(sendCurrentSegment().creation_reason).not.toBe('visibility_change')
    })

    it('renews segment when the current segment deflate size reaches SEND_BEACON_BYTE_LENGTH_LIMIT', () => {
      const { worker, addRecord, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      worker.deflatedSize = SEND_BEACON_BYTE_LENGTH_LIMIT
      addRecord(RECORD)
      worker.process()

      expect(sendCurrentSegment().creation_reason).toBe('max_size')
    })

    it('renews a segment after MAX_SEGMENT_DURATION', () => {
      jasmine.clock().install()
      const { segmentCompleteSpy, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      jasmine.clock().tick(MAX_SEGMENT_DURATION)
      expect(segmentCompleteSpy).toHaveBeenCalledTimes(1)
      expect(sendCurrentSegment().creation_reason).toBe('max_duration')
    })

    it('does not renew a segment after MAX_SEGMENT_DURATION if a segment has been created in the meantime', () => {
      jasmine.clock().install()
      const { lifeCycle, segmentCompleteSpy, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      jasmine.clock().tick(BEFORE_MAX_SEGMENT_DURATION)
      lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
      expect(segmentCompleteSpy).toHaveBeenCalledTimes(1)
      jasmine.clock().tick(BEFORE_MAX_SEGMENT_DURATION)
      expect(segmentCompleteSpy).toHaveBeenCalledTimes(1)
      expect(sendCurrentSegment().creation_reason).not.toBe('max_duration')
    })
  })
})

describe('getSegmentContext', () => {
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
    expect(doGetSegmentContext('appid', DEFAULT_SESSION, mockParentContexts(DEFAULT_VIEW_CONTEXT))).toEqual({
      application: { id: 'appid' },
      session: { id: '456' },
      view: { id: '123' },
    })
  })

  it('returns undefined if there is no current view', () => {
    expect(doGetSegmentContext('appid', DEFAULT_SESSION, mockParentContexts(undefined))).toBeUndefined()
  })

  it('returns undefined if there is no session id', () => {
    expect(
      doGetSegmentContext(
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
      doGetSegmentContext(
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
    return {
      findView() {
        return view
      },
    } as any
  }
})
