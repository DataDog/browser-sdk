import type { TimeStamp } from '@datadog/browser-core'
import { PageExitReason, isIE } from '@datadog/browser-core'
import type { ViewContexts, ViewContext } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock, restorePageVisibility } from '@datadog/browser-core/test/specHelper'
import { createRumSessionManagerMock } from '../../../../rum-core/test/mockRumSessionManager'
import type { BrowserRecord, BrowserSegmentMetadata, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import { MockWorker } from '../../../test/utils'
import {
  computeSegmentContext,
  doStartSegmentCollection,
  SEGMENT_BYTES_LIMIT,
  SEGMENT_DURATION_LIMIT,
} from './segmentCollection'

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }
const RECORD: BrowserRecord = { type: RecordType.ViewEnd, timestamp: 10 as TimeStamp }

// A record that will make the segment size reach the SEGMENT_BYTES_LIMIT
const VERY_BIG_RECORD: BrowserRecord = {
  type: RecordType.FullSnapshot,
  timestamp: 10 as TimeStamp,
  data: Array(SEGMENT_BYTES_LIMIT).join('a') as any,
}

const BEFORE_SEGMENT_DURATION_LIMIT = SEGMENT_DURATION_LIMIT * 0.9

describe('startSegmentCollection', () => {
  let stopSegmentCollection: () => void
  let clock: Clock | undefined

  function startSegmentCollection(context: SegmentContext | undefined) {
    const lifeCycle = new LifeCycle()
    const worker = new MockWorker()
    const sendSpy = jasmine.createSpy<(data: Uint8Array, metadata: BrowserSegmentMetadata) => void>()

    const { stop, addRecord } = doStartSegmentCollection(lifeCycle, () => context, sendSpy, worker)
    stopSegmentCollection = stop
    return {
      addRecord,
      lifeCycle,
      sendSpy,
      worker,
      sendCurrentSegment: () => {
        // Make sure the segment is not empty
        addRecord(RECORD)
        // Flush segment
        lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
        worker.processAllMessages()
        return sendSpy.calls.mostRecent().args[1]
      },
    }
  }

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  afterEach(() => {
    clock?.cleanup()
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
    lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
    worker.processAllMessages()
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it("ignores calls to addRecord if context can't be get", () => {
    const { lifeCycle, worker, sendSpy, addRecord } = startSegmentCollection(undefined)
    addRecord(RECORD)
    lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
    expect(worker.pendingData).toBe('')
    worker.processAllMessages()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  describe('segment flush strategy', () => {
    afterEach(() => {
      restorePageVisibility()
    })

    it('does not flush empty segments', () => {
      const { lifeCycle, sendSpy, worker } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
      worker.processAllMessages()
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('flushes segment on unload', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
      expect(sendCurrentSegment().creation_reason).toBe('before_unload')
    })

    it('flushes segment on view change', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)
      expect(sendCurrentSegment().creation_reason).toBe('view_change')
    })

    it('flushes segment when the page become hidden', () => {
      const { lifeCycle, sendCurrentSegment } = startSegmentCollection(CONTEXT)
      lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.HIDDEN })
      expect(sendCurrentSegment().creation_reason).toBe('visibility_hidden')
    })

    describe('segment_bytes_limit flush strategy', () => {
      it('flushes segment when the current segment deflate size reaches SEGMENT_BYTES_LIMIT', () => {
        const { worker, addRecord, sendCurrentSegment } = startSegmentCollection(CONTEXT)
        addRecord(VERY_BIG_RECORD)
        worker.processAllMessages()

        expect(sendCurrentSegment().creation_reason).toBe('segment_bytes_limit')
      })

      it('continues to add records to the current segment while the worker is processing messages', () => {
        const { worker, addRecord, sendSpy } = startSegmentCollection(CONTEXT)
        addRecord(VERY_BIG_RECORD)
        addRecord(RECORD)
        addRecord(RECORD)
        addRecord(RECORD)
        worker.processAllMessages()

        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendSpy.calls.mostRecent().args[1].records_count).toBe(4)
      })

      it('does not flush segment prematurely when records from the previous segment are still being processed', () => {
        const { worker, addRecord, sendSpy } = startSegmentCollection(CONTEXT)
        // Add two records to the current segment
        addRecord(VERY_BIG_RECORD)
        addRecord(RECORD)

        // Process only the first record. This should flush the current segment because it reached
        // the segment bytes limit.
        worker.processNextMessage()

        // Add a record to the new segment, to make sure it is not flushed even if it is not empty
        addRecord(RECORD)

        worker.processAllMessages()

        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendSpy.calls.mostRecent().args[1].records_count).toBe(2)
      })
    })

    describe('segment_duration_limit flush strategy', () => {
      it('flushes a segment after SEGMENT_DURATION_LIMIT', () => {
        clock = mockClock()
        const { sendCurrentSegment, addRecord, sendSpy, worker } = startSegmentCollection(CONTEXT)
        addRecord(RECORD)
        clock.tick(SEGMENT_DURATION_LIMIT)
        worker.processAllMessages()
        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendCurrentSegment().creation_reason).toBe('segment_duration_limit')
      })

      it('does not flush a segment after SEGMENT_DURATION_LIMIT if a segment has been created in the meantime', () => {
        clock = mockClock()
        const { lifeCycle, sendCurrentSegment, addRecord, sendSpy, worker } = startSegmentCollection(CONTEXT)
        addRecord(RECORD)
        clock.tick(BEFORE_SEGMENT_DURATION_LIMIT)
        lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
        addRecord(RECORD)
        clock.tick(BEFORE_SEGMENT_DURATION_LIMIT)

        worker.processAllMessages()
        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendCurrentSegment().creation_reason).not.toBe('segment_duration_limit')
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
  const DEFAULT_VIEW_CONTEXT: ViewContext = { id: '123' }
  const DEFAULT_SESSION = createRumSessionManagerMock().setId('456')

  it('returns a segment context', () => {
    expect(computeSegmentContext('appid', DEFAULT_SESSION, mockViewContexts(DEFAULT_VIEW_CONTEXT))).toEqual({
      application: { id: 'appid' },
      session: { id: '456' },
      view: { id: '123' },
    })
  })

  it('returns undefined if there is no current view', () => {
    expect(computeSegmentContext('appid', DEFAULT_SESSION, mockViewContexts(undefined))).toBeUndefined()
  })

  it('returns undefined if the session is not tracked', () => {
    expect(
      computeSegmentContext(
        'appid',
        createRumSessionManagerMock().setNotTracked(),
        mockViewContexts(DEFAULT_VIEW_CONTEXT)
      )
    ).toBeUndefined()
  })

  function mockViewContexts(view: ViewContext | undefined): ViewContexts {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return {
      findView() {
        return view
      },
    } as any
  }
})
