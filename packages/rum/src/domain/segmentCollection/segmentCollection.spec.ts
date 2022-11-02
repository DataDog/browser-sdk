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
  let clock: Clock
  let lifeCycle: LifeCycle
  let worker: MockWorker
  let sendSpy: jasmine.Spy<(data: Uint8Array, metadata: BrowserSegmentMetadata) => void>
  let addRecord: (record: BrowserRecord) => void
  let context: SegmentContext | undefined

  function addRecordAndFlushSegment(flushStrategy: () => void = emulatePageUnload) {
    // Make sure the segment is not empty
    addRecord(RECORD)
    // Flush segment
    flushStrategy()
    worker.processAllMessages()
  }

  function emulatePageUnload() {
    lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
  }

  function getSentMetadata() {
    return sendSpy.calls.mostRecent().args[1]
  }

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    lifeCycle = new LifeCycle()
    worker = new MockWorker()
    sendSpy = jasmine.createSpy<(data: Uint8Array, metadata: BrowserSegmentMetadata) => void>()
    context = CONTEXT
    ;({ stop: stopSegmentCollection, addRecord } = doStartSegmentCollection(lifeCycle, () => context, sendSpy, worker))
  })

  afterEach(() => {
    clock?.cleanup()
    stopSegmentCollection()
  })

  describe('initial segment', () => {
    it('immediately starts a new segment', () => {
      expect(worker.pendingData).toBe('')
      addRecord(RECORD)
      expect(worker.pendingData).toBe('{"records":[{"type":7,"timestamp":10}')
      worker.processAllMessages()
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('creation reason should reflect that it is the initial segment', () => {
      addRecordAndFlushSegment()
      expect(getSentMetadata().creation_reason).toBe('init')
    })
  })

  it('sends a segment', () => {
    addRecordAndFlushSegment()
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it("ignores calls to addRecord if context can't be get", () => {
    context = undefined
    addRecord(RECORD)
    emulatePageUnload()
    expect(worker.pendingData).toBe('')
    worker.processAllMessages()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  describe('segment flush strategy', () => {
    afterEach(() => {
      restorePageVisibility()
    })

    it('does not flush empty segments', () => {
      emulatePageUnload()
      worker.processAllMessages()
      expect(sendSpy).not.toHaveBeenCalled()
    })

    describe('flush when the page exits because it is unloading', () => {
      it('next segment is created because of beforeunload event', () => {
        addRecordAndFlushSegment(emulatePageUnload)
        addRecordAndFlushSegment()
        expect(getSentMetadata().creation_reason).toBe('before_unload')
      })
    })

    describe('flush when the page exits because it gets hidden', () => {
      function emulatePageHidden() {
        lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.HIDDEN })
      }

      it('next segment is created because of visibility hidden event', () => {
        addRecordAndFlushSegment(emulatePageHidden)
        addRecordAndFlushSegment()
        expect(getSentMetadata().creation_reason).toBe('visibility_hidden')
      })
    })

    describe('flush when the view changes', () => {
      function emulateViewChange() {
        lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)
      }

      it('next segment is created because of view change', () => {
        addRecordAndFlushSegment(emulateViewChange)
        addRecordAndFlushSegment()
        expect(getSentMetadata().creation_reason).toBe('view_change')
      })
    })

    describe('flush when reaching a bytes limit', () => {
      it('next segment is created because the bytes limit has been reached', () => {
        addRecordAndFlushSegment(() => {
          addRecord(VERY_BIG_RECORD)
        })
        addRecordAndFlushSegment()

        expect(getSentMetadata().creation_reason).toBe('segment_bytes_limit')
      })

      it('continues to add records to the current segment while the worker is processing messages', () => {
        addRecord(VERY_BIG_RECORD)
        addRecord(RECORD)
        addRecord(RECORD)
        addRecord(RECORD)
        worker.processAllMessages()

        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendSpy.calls.mostRecent().args[1].records_count).toBe(4)
      })

      it('does not flush segment prematurely when records from the previous segment are still being processed', () => {
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

    describe('flush when a duration has been reached', () => {
      it('next segment is created because of the segment duration limit has been reached', () => {
        clock = mockClock()
        addRecordAndFlushSegment(() => {
          clock.tick(SEGMENT_DURATION_LIMIT)
        })
        addRecordAndFlushSegment()
        expect(getSentMetadata().creation_reason).toBe('segment_duration_limit')
      })

      it('does not flush a segment after SEGMENT_DURATION_LIMIT if a segment has been created in the meantime', () => {
        clock = mockClock()
        addRecord(RECORD)
        clock.tick(BEFORE_SEGMENT_DURATION_LIMIT)
        emulatePageUnload()
        addRecord(RECORD)
        clock.tick(BEFORE_SEGMENT_DURATION_LIMIT)

        worker.processAllMessages()
        expect(sendSpy).toHaveBeenCalledTimes(1)
        addRecordAndFlushSegment()
        expect(getSentMetadata().creation_reason).not.toBe('segment_duration_limit')
      })
    })

    describe('flush when stopping segment collection', () => {
      it('flushes a segment when calling stop()', () => {
        addRecordAndFlushSegment(stopSegmentCollection)
        expect(sendSpy).toHaveBeenCalledTimes(1)
      })
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
