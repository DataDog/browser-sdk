import { createNewEvent, DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts, RumSession, ViewContext } from '@datadog/browser-rum-core'
import { Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { MockWorker } from '../../test/utils'
import { SEND_BEACON_BYTE_LENGTH_LIMIT } from '../transport/send'
import { computeSegmentContext, doStartSegmentCollection, MAX_SEGMENT_DURATION } from './segmentCollection'

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }
const RECORD: Record = { type: RecordType.ViewEnd, timestamp: 10 }

// A record that will make the segment size reach the SEND_BEACON_BYTE_LENGTH_LIMIT limit
const VERY_BIG_RECORD: Record = {
  type: RecordType.FullSnapshot,
  timestamp: 10,
  data: Array(SEND_BEACON_BYTE_LENGTH_LIMIT).join('a') as any,
}

const BEFORE_MAX_SEGMENT_DURATION = MAX_SEGMENT_DURATION * 0.9

describe('startSegmentCollection', () => {
  let stopSegmentCollection: () => void

  function startSegmentCollection(context: SegmentContext | undefined) {
    const lifeCycle = new LifeCycle()
    const worker = new MockWorker()
    const eventEmitter = document.createElement('div')
    const sendSpy = jasmine.createSpy<(data: Uint8Array, meta: SegmentMeta) => void>()

    const { stop, addRecord } = doStartSegmentCollection(lifeCycle, () => context, sendSpy, worker, eventEmitter)
    stopSegmentCollection = stop
    return {
      addRecord,
      eventEmitter,
      lifeCycle,
      sendSpy,
      worker,
      sendCurrentSegment: () => {
        // Make sure the segment is not empty
        addRecord(RECORD)
        // Flush segment
        lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
        worker.processAllMessages()
        return sendSpy.calls.mostRecent().args[1]
      },
    }
  }

  afterEach(() => {
    jasmine.clock().uninstall()
    stopSegmentCollection()
  })

  it('immediately starts a new segment', () => {
    const { addRecord, worker, sendSpy, sendCurrentSegment } = startSegmentCollection(CONTEXT)
    expect(worker.pendingData).toBe('')
    addRecord(RECORD)
    expect(worker.pendingData).toBe('{"records":[{"type":7,"timestamp":10}')
    worker.processAllMessages()
    expect(sendSpy).not.toHaveBeenCalled()
    expect(sendCurrentSegment().creation_reason).toBe('init')
  })

  it('sends a segment', () => {
    const { lifeCycle, worker, sendSpy, addRecord } = startSegmentCollection(CONTEXT)
    addRecord(RECORD)
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
    worker.processAllMessages()
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it("ignores calls to addRecord if context can't be get", () => {
    const { lifeCycle, worker, sendSpy, addRecord } = startSegmentCollection(undefined)
    addRecord(RECORD)
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
    expect(worker.pendingData).toBe('')
    worker.processAllMessages()
    expect(sendSpy).not.toHaveBeenCalled()
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

    it('flushes segment when the page become hidden', () => {
      setPageVisibility('hidden')
      const { addRecord, eventEmitter, sendCurrentSegment, worker, sendSpy } = startSegmentCollection(CONTEXT)
      addRecord(RECORD)
      eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))

      worker.processAllMessages()
      expect(sendSpy).toHaveBeenCalledTimes(1)
      expect(sendCurrentSegment().creation_reason).toBe('visibility_hidden')
    })

    it('does not flush segment when the page become visible', () => {
      setPageVisibility('visible')
      const { addRecord, eventEmitter, sendCurrentSegment, worker, sendSpy } = startSegmentCollection(CONTEXT)
      addRecord(RECORD)
      eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))

      worker.processAllMessages()
      expect(sendSpy).not.toHaveBeenCalled()
      expect(sendCurrentSegment().creation_reason).not.toBe('visibility_hidden')
    })

    describe('max_size flush strategy', () => {
      it('flushes segment when the current segment deflate size reaches SEND_BEACON_BYTE_LENGTH_LIMIT', () => {
        const { worker, addRecord, sendCurrentSegment } = startSegmentCollection(CONTEXT)
        addRecord(VERY_BIG_RECORD)
        worker.processAllMessages()

        expect(sendCurrentSegment().creation_reason).toBe('max_size')
      })

      it('does not flush segment prematurely when records from the previous segment are still being processed', () => {
        const { worker, addRecord, sendSpy } = startSegmentCollection(CONTEXT)
        addRecord(VERY_BIG_RECORD)
        addRecord(RECORD)
        // Process only the first record
        worker.processNextMessage()
        addRecord(RECORD)
        worker.processAllMessages()

        expect(sendSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('max_duration flush strategy', () => {
      it('flushes a segment after MAX_SEGMENT_DURATION', () => {
        jasmine.clock().install()
        const { sendCurrentSegment, addRecord, sendSpy, worker } = startSegmentCollection(CONTEXT)
        addRecord(RECORD)
        jasmine.clock().tick(MAX_SEGMENT_DURATION)
        worker.processAllMessages()
        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendCurrentSegment().creation_reason).toBe('max_duration')
      })

      it('does not flush a segment after MAX_SEGMENT_DURATION if a segment has been created in the meantime', () => {
        jasmine.clock().install()
        const { lifeCycle, sendCurrentSegment, addRecord, sendSpy, worker } = startSegmentCollection(CONTEXT)
        addRecord(RECORD)
        jasmine.clock().tick(BEFORE_MAX_SEGMENT_DURATION)
        lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
        addRecord(RECORD)
        jasmine.clock().tick(BEFORE_MAX_SEGMENT_DURATION)

        worker.processAllMessages()
        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendCurrentSegment().creation_reason).not.toBe('max_duration')
      })
    })

    it('flushes a segment when calling stop()', () => {
      const { addRecord, worker, sendSpy } = startSegmentCollection(CONTEXT)
      addRecord(RECORD)
      stopSegmentCollection()
      worker.processAllMessages()
      expect(sendSpy).toHaveBeenCalledTimes(1)
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
