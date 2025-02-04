import type { ClocksState, HttpRequest, TimeStamp } from '@datadog/browser-core'
import { DeflateEncoderStreamId, PageExitReason } from '@datadog/browser-core'
import type { ViewHistory, ViewHistoryEntry, RumConfiguration } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask, restorePageVisibility } from '@datadog/browser-core/test'
import { createRumSessionManagerMock } from '../../../../rum-core/test'
import type { BrowserRecord, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import { MockWorker, readMetadataFromReplayPayload } from '../../../test'
import { createDeflateEncoder } from '../deflate'
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
  let httpRequestSpy: {
    sendOnExit: jasmine.Spy<HttpRequest['sendOnExit']>
    send: jasmine.Spy<HttpRequest['send']>
  }
  let addRecord: (record: BrowserRecord) => void
  let context: SegmentContext | undefined
  let configuration: RumConfiguration

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

  function readMostRecentMetadata(spy: jasmine.Spy<HttpRequest['send']>) {
    return readMetadataFromReplayPayload(spy.calls.mostRecent().args[0])
  }

  beforeEach(() => {
    configuration = {} as RumConfiguration
    lifeCycle = new LifeCycle()
    worker = new MockWorker()
    httpRequestSpy = {
      sendOnExit: jasmine.createSpy(),
      send: jasmine.createSpy(),
    }
    context = CONTEXT
    ;({ stop: stopSegmentCollection, addRecord } = doStartSegmentCollection(
      lifeCycle,
      () => context,
      httpRequestSpy,
      createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
    ))

    registerCleanupTask(() => {
      clock?.cleanup()
      stopSegmentCollection()
    })
  })

  describe('initial segment', () => {
    it('immediately starts a new segment', () => {
      expect(worker.pendingData).toBe('')
      addRecord(RECORD)
      expect(worker.pendingData).toBe('{"records":[{"type":7,"timestamp":10}')
      worker.processAllMessages()
      expect(httpRequestSpy.send).not.toHaveBeenCalled()
      expect(httpRequestSpy.sendOnExit).not.toHaveBeenCalled()
    })

    it('creation reason should reflect that it is the initial segment', async () => {
      addRecordAndFlushSegment()
      expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).toBe('init')
    })
  })

  it('sends a segment', () => {
    addRecordAndFlushSegment()
    expect(httpRequestSpy.sendOnExit).toHaveBeenCalledTimes(1)
  })

  it("ignores calls to addRecord if context can't be get", () => {
    context = undefined
    addRecord(RECORD)
    emulatePageUnload()
    expect(worker.pendingData).toBe('')
    worker.processAllMessages()
    expect(httpRequestSpy.send).not.toHaveBeenCalled()
    expect(httpRequestSpy.sendOnExit).not.toHaveBeenCalled()
  })

  describe('segment flush strategy', () => {
    afterEach(() => {
      restorePageVisibility()
    })

    it('does not flush empty segments', () => {
      emulatePageUnload()
      worker.processAllMessages()
      expect(httpRequestSpy.send).not.toHaveBeenCalled()
      expect(httpRequestSpy.sendOnExit).not.toHaveBeenCalled()
    })

    describe('flush when the page exits because it is unloading', () => {
      it('uses `httpRequest.sendOnExit` when sending the segment', () => {
        addRecordAndFlushSegment(emulatePageUnload)
        expect(httpRequestSpy.sendOnExit).toHaveBeenCalled()
      })

      it('next segment is created because of beforeunload event', async () => {
        addRecordAndFlushSegment(emulatePageUnload)
        addRecordAndFlushSegment()
        expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).toBe('before_unload')
      })
    })

    describe('flush when the page exits because it gets hidden', () => {
      function emulatePageHidden() {
        lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.HIDDEN })
      }

      it('uses `httpRequest.sendOnExit` when sending the segment', () => {
        addRecordAndFlushSegment(emulatePageHidden)
        expect(httpRequestSpy.sendOnExit).toHaveBeenCalled()
      })

      it('next segment is created because of visibility hidden event', async () => {
        addRecordAndFlushSegment(emulatePageHidden)
        addRecordAndFlushSegment()
        expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).toBe('visibility_hidden')
      })
    })

    describe('flush when the page exits because it gets frozen', () => {
      function emulatePageFrozen() {
        lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.FROZEN })
      }

      it('uses `httpRequest.sendOnExit` when sending the segment', () => {
        addRecordAndFlushSegment(emulatePageFrozen)
        expect(httpRequestSpy.sendOnExit).toHaveBeenCalled()
      })

      it('next segment is created because of page freeze event', async () => {
        addRecordAndFlushSegment(emulatePageFrozen)
        addRecordAndFlushSegment()
        expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).toBe('page_frozen')
      })
    })

    describe('flush when the view changes', () => {
      function emulateViewChange() {
        lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)
      }

      it('uses `httpRequest.send` when sending the segment', () => {
        addRecordAndFlushSegment(emulateViewChange)
        expect(httpRequestSpy.send).toHaveBeenCalled()
      })

      it('next segment is created because of view change', async () => {
        addRecordAndFlushSegment(emulateViewChange)
        addRecordAndFlushSegment()
        expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).toBe('view_change')
      })
    })

    describe('flush when reaching a bytes limit', () => {
      it('uses `httpRequest.send` when sending the segment', () => {
        addRecordAndFlushSegment(() => {
          addRecord(VERY_BIG_RECORD)
        })
        expect(httpRequestSpy.send).toHaveBeenCalled()
      })

      it('next segment is created because the bytes limit has been reached', async () => {
        addRecordAndFlushSegment(() => {
          addRecord(VERY_BIG_RECORD)
        })
        addRecordAndFlushSegment()

        expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).toBe('segment_bytes_limit')
      })

      it('continues to add records to the current segment while the worker is processing messages', async () => {
        addRecord(VERY_BIG_RECORD)
        addRecord(RECORD)
        addRecord(RECORD)
        addRecord(RECORD)
        worker.processAllMessages()

        expect(httpRequestSpy.send).toHaveBeenCalledTimes(1)
        expect((await readMostRecentMetadata(httpRequestSpy.send)).records_count).toBe(4)
      })

      it('does not flush segment prematurely when records from the previous segment are still being processed', async () => {
        // Add two records to the current segment
        addRecord(VERY_BIG_RECORD)
        addRecord(RECORD)

        // Process only the first record. This should flush the current segment because it reached
        // the segment bytes limit.
        worker.processNextMessage()

        // Add a record to the new segment, to make sure it is not flushed even if it is not empty
        addRecord(RECORD)

        worker.processAllMessages()

        expect(httpRequestSpy.send).toHaveBeenCalledTimes(1)
        expect((await readMostRecentMetadata(httpRequestSpy.send)).records_count).toBe(2)
      })
    })

    describe('flush when a duration has been reached', () => {
      it('uses `httpRequest.send` when sending the segment', () => {
        clock = mockClock()
        addRecordAndFlushSegment(() => {
          clock!.tick(SEGMENT_DURATION_LIMIT)
        })
        expect(httpRequestSpy.send).toHaveBeenCalled()
      })

      it('next segment is created because of the segment duration limit has been reached', async () => {
        clock = mockClock()
        addRecordAndFlushSegment(() => {
          clock!.tick(SEGMENT_DURATION_LIMIT)
        })
        addRecordAndFlushSegment()
        expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).toBe('segment_duration_limit')
      })

      it('does not flush a segment after SEGMENT_DURATION_LIMIT if a segment has been created in the meantime', async () => {
        clock = mockClock()
        addRecord(RECORD)
        clock.tick(BEFORE_SEGMENT_DURATION_LIMIT)
        emulatePageUnload()
        addRecord(RECORD)
        clock.tick(BEFORE_SEGMENT_DURATION_LIMIT)

        worker.processAllMessages()
        expect(httpRequestSpy.sendOnExit).toHaveBeenCalledTimes(1)
        addRecordAndFlushSegment()
        expect((await readMostRecentMetadata(httpRequestSpy.sendOnExit)).creation_reason).not.toBe(
          'segment_duration_limit'
        )
      })
    })

    describe('flush when stopping segment collection', () => {
      it('uses `httpRequest.send` when sending the segment', () => {
        addRecordAndFlushSegment(stopSegmentCollection)
        expect(httpRequestSpy.send).toHaveBeenCalled()
      })
    })
  })
})

describe('computeSegmentContext', () => {
  const DEFAULT_VIEW_CONTEXT: ViewHistoryEntry = { id: '123', startClocks: {} as ClocksState }
  const DEFAULT_SESSION = createRumSessionManagerMock().setId('456')

  it('returns a segment context', () => {
    expect(computeSegmentContext('appid', DEFAULT_SESSION, mockViewHistory(DEFAULT_VIEW_CONTEXT))).toEqual({
      application: { id: 'appid' },
      session: { id: '456' },
      view: { id: '123' },
    })
  })

  it('returns undefined if there is no current view', () => {
    expect(computeSegmentContext('appid', DEFAULT_SESSION, mockViewHistory(undefined))).toBeUndefined()
  })

  it('returns undefined if the session is not tracked', () => {
    expect(
      computeSegmentContext(
        'appid',
        createRumSessionManagerMock().setNotTracked(),
        mockViewHistory(DEFAULT_VIEW_CONTEXT)
      )
    ).toBeUndefined()
  })

  function mockViewHistory(view: ViewHistoryEntry | undefined): ViewHistory {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return {
      findView() {
        return view
      },
    } as any
  }
})
