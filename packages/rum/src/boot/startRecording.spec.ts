import type { TimeStamp, HttpRequest, ClocksState } from '@datadog/browser-core'
import { PageExitReason, DefaultPrivacyLevel, noop, isIE, timeStampNow } from '@datadog/browser-core'
import type { LifeCycle, ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { Clock } from '@datadog/browser-core/test'
import { collectAsyncCalls, createNewEvent, mockClock } from '@datadog/browser-core/test'
import type { RumSessionManagerMock, TestSetupBuilder } from '../../../rum-core/test'
import { createRumSessionManagerMock, setup } from '../../../rum-core/test'

import { recordsPerFullSnapshot, readReplayPayload } from '../../test'
import { setSegmentBytesLimit, startDeflateWorker } from '../domain/segmentCollection'

import { RecordType } from '../types'
import { resetReplayStats } from '../domain/replayStats'
import { startRecording } from './startRecording'

const VIEW_TIMESTAMP = 1 as TimeStamp

describe('startRecording', () => {
  let setupBuilder: TestSetupBuilder
  let sessionManager: RumSessionManagerMock
  let viewId: string
  let sandbox: HTMLElement
  let textField: HTMLInputElement
  let requestSendSpy: jasmine.Spy<HttpRequest['sendOnExit']>
  let stopRecording: () => void
  let clock: Clock | undefined

  beforeEach((done) => {
    if (isIE()) {
      pending('IE not supported')
    }
    resetReplayStats()
    sessionManager = createRumSessionManagerMock()
    viewId = 'view-id'

    sandbox = document.createElement('div')
    document.body.appendChild(sandbox)
    textField = document.createElement('input')
    sandbox.appendChild(textField)

    startDeflateWorker((worker) => {
      setupBuilder = setup()
        .withViewContexts({
          findView() {
            return { id: viewId, startClocks: {} as ClocksState }
          },
        })
        .withSessionManager(sessionManager)
        .withConfiguration({
          defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
        })
        .beforeBuild(({ lifeCycle, configuration, viewContexts, sessionManager }) => {
          requestSendSpy = jasmine.createSpy()
          const httpRequest = {
            send: requestSendSpy,
            sendOnExit: requestSendSpy,
          }

          const recording = startRecording(lifeCycle, configuration, sessionManager, viewContexts, worker!, httpRequest)
          stopRecording = recording ? recording.stop : noop
          return { stop: stopRecording }
        })
      done()
    })
  })

  afterEach(() => {
    sandbox.remove()
    setSegmentBytesLimit()
    setupBuilder.cleanup()
    clock?.cleanup()
  })

  it('sends recorded segments with valid context', async () => {
    const { lifeCycle } = setupBuilder.build()
    flushSegment(lifeCycle)

    const requests = await readSentRequests(1)
    expect(requests[0].segment).toEqual(jasmine.any(Object))
    expect(requests[0].metadata).toEqual({
      application: {
        id: 'appId',
      },
      creation_reason: 'init',
      end: jasmine.stringMatching(/^\d{13}$/),
      has_full_snapshot: true,
      records_count: recordsPerFullSnapshot(),
      session: {
        id: 'session-id',
      },
      start: jasmine.any(Number),
      raw_segment_size: jasmine.any(Number),
      compressed_segment_size: jasmine.any(Number),
      view: {
        id: 'view-id',
      },
      index_in_view: 0,
      source: 'browser',
    })
  })

  it('flushes the segment when its compressed data reaches the segment bytes limit', async () => {
    setupBuilder.build()
    const inputCount = 150
    const inputEvent = createNewEvent('input', { target: textField })
    for (let i = 0; i < inputCount; i += 1) {
      // Create a random value harder to deflate, so we don't have to send too many events to reach
      // the limit.
      textField.value = createRandomString(1000)
      document.body.dispatchEvent(inputEvent)
    }

    const requests = await readSentRequests(1)
    expect(requests[0].metadata.records_count).toBe(inputCount + recordsPerFullSnapshot())
  })

  it('stops sending new segment when the session is expired', async () => {
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    sessionManager.setNotTracked()
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    flushSegment(lifeCycle)

    const requests = await readSentRequests(1)
    expect(requests[0].metadata.records_count).toBe(1 + recordsPerFullSnapshot())
  })

  it('restarts sending segments when the session is renewed', async () => {
    sessionManager.setNotTracked()
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    sessionManager.setId('new-session-id').setPlanWithSessionReplay()
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    flushSegment(lifeCycle)

    const requests = await readSentRequests(1)
    expect(requests[0].metadata.records_count).toBe(1)
    expect(requests[0].metadata.session.id).toBe('new-session-id')
  })

  it('takes a full snapshot when the view changes', async () => {
    const { lifeCycle } = setupBuilder.build()

    changeView(lifeCycle)
    flushSegment(lifeCycle)

    const requests = await readSentRequests(2)
    expect(requests[1].metadata.has_full_snapshot).toBe(true)
  })

  it('full snapshot related records should have the view change date', async () => {
    clock = mockClock()
    const { lifeCycle } = setupBuilder.build()

    changeView(lifeCycle)
    flushSegment(lifeCycle)

    const requests = await readSentRequests(2)
    const firstSegment = requests[0].segment
    expect(firstSegment.records[0].timestamp).toEqual(timeStampNow())
    expect(firstSegment.records[1].timestamp).toEqual(timeStampNow())
    expect(firstSegment.records[2].timestamp).toEqual(timeStampNow())
    expect(firstSegment.records[3].timestamp).toEqual(timeStampNow())

    const secondSegment = requests[1].segment
    expect(secondSegment.records[0].timestamp).toEqual(VIEW_TIMESTAMP)
    expect(secondSegment.records[1].timestamp).toEqual(VIEW_TIMESTAMP)
    expect(secondSegment.records[2].timestamp).toEqual(VIEW_TIMESTAMP)
  })

  it('adds a ViewEnd record when the view ends', async () => {
    const { lifeCycle } = setupBuilder.build()

    changeView(lifeCycle)
    flushSegment(lifeCycle)

    const requests = await readSentRequests(2)
    expect(requests[0].metadata.view.id).toBe('view-id')
    const records = requests[0].segment.records
    expect(records[records.length - 1].type).toBe(RecordType.ViewEnd)
  })

  it('flushes pending mutations before ending the view', async () => {
    const { lifeCycle } = setupBuilder.build()

    sandbox.appendChild(document.createElement('hr'))
    changeView(lifeCycle)
    flushSegment(lifeCycle)

    const requests = await readSentRequests(2)
    const firstSegment = requests[0].segment
    expect(firstSegment.records[firstSegment.records.length - 2].type).toBe(RecordType.IncrementalSnapshot)
    expect(firstSegment.records[firstSegment.records.length - 1].type).toBe(RecordType.ViewEnd)

    const secondSegment = requests[1].segment
    expect(secondSegment.records[0].type).toBe(RecordType.Meta)
  })

  it('does not split Meta, Focus and FullSnapshot records between multiple segments when taking a full snapshot', async () => {
    setSegmentBytesLimit(0)
    setupBuilder.build()

    const requests = await readSentRequests(1)
    expect(requests[0].segment.records[0].type).toBe(RecordType.Meta)
    expect(requests[0].segment.records[1].type).toBe(RecordType.Focus)
    expect(requests[0].segment.records[2].type).toBe(RecordType.FullSnapshot)
  })

  describe('when calling stop()', () => {
    it('stops collecting records', async () => {
      const { lifeCycle } = setupBuilder.build()

      document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))
      stopRecording()
      document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))
      flushSegment(lifeCycle)

      const requests = await readSentRequests(1)
      expect(requests[0].metadata.records_count).toBe(1 + recordsPerFullSnapshot())
    })

    it('stops taking full snapshots on view creation', async () => {
      const { lifeCycle } = setupBuilder.build()

      stopRecording()
      changeView(lifeCycle)
      flushSegment(lifeCycle)

      const requests = await readSentRequests(1)
      expect(requests[0].metadata.records_count).toBe(recordsPerFullSnapshot())
    })
  })

  function changeView(lifeCycle: LifeCycle) {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)
    viewId = 'view-id-2'
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: { relative: 1, timeStamp: VIEW_TIMESTAMP },
    } as Partial<ViewCreatedEvent> as any)
  }

  async function readSentRequests(expectedSentRequestCount: number) {
    const calls = await new Promise<jasmine.Calls<HttpRequest['sendOnExit']>>((resolve) =>
      collectAsyncCalls(requestSendSpy, expectedSentRequestCount, resolve)
    )
    return Promise.all(calls.all().map((call) => readReplayPayload(call.args[0])))
  }
})

function flushSegment(lifeCycle: LifeCycle) {
  lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
}

function createRandomString(minLength: number) {
  let result = ''
  while (result.length < minLength) {
    result += Math.random().toString(36)
  }
  return result
}
