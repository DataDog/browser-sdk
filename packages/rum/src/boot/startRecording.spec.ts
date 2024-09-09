import type { TimeStamp, HttpRequest } from '@datadog/browser-core'
import { PageExitReason, DefaultPrivacyLevel, noop, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType, startViewContexts } from '@datadog/browser-rum-core'
import { collectAsyncCalls, createNewEvent, mockEventBridge, registerCleanupTask } from '@datadog/browser-core/test'
import type { ViewEndedEvent } from 'packages/rum-core/src/domain/view/trackViews'
import type { RumSessionManagerMock } from '../../../rum-core/test'
import { appendElement, createRumSessionManagerMock, mockRumConfiguration } from '../../../rum-core/test'

import { recordsPerFullSnapshot, readReplayPayload } from '../../test'
import { setSegmentBytesLimit } from '../domain/segmentCollection'

import { RecordType } from '../types'
import { resetReplayStats } from '../domain/replayStats'
import { createDeflateEncoder, resetDeflateWorkerState, startDeflateWorker } from '../domain/deflate'
import { startRecording } from './startRecording'

const VIEW_TIMESTAMP = 1 as TimeStamp

describe('startRecording', () => {
  const lifeCycle = new LifeCycle()
  let sessionManager: RumSessionManagerMock
  let viewId: string
  let textField: HTMLInputElement
  let requestSendSpy: jasmine.Spy<HttpRequest['sendOnExit']>
  let stopRecording: () => void

  function setupStartRecording() {
    const configuration = mockRumConfiguration({ defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW })
    resetReplayStats()
    const worker = startDeflateWorker(configuration, 'Session Replay', noop)

    requestSendSpy = jasmine.createSpy()
    const httpRequest = {
      send: requestSendSpy,
      sendOnExit: requestSendSpy,
    }

    const deflateEncoder = createDeflateEncoder(configuration, worker!, DeflateEncoderStreamId.REPLAY)
    const viewContexts = startViewContexts(lifeCycle)
    initialView(lifeCycle)

    const recording = startRecording(
      lifeCycle,
      configuration,
      sessionManager,
      viewContexts,
      deflateEncoder,
      httpRequest
    )
    stopRecording = recording ? recording.stop : noop

    registerCleanupTask(() => {
      stopRecording()
      deflateEncoder.stop()
      setSegmentBytesLimit()
      resetDeflateWorkerState()
    })
  }

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    sessionManager = createRumSessionManagerMock()
    viewId = 'view-id'

    textField = appendElement('<input />') as HTMLInputElement
  })

  it('sends recorded segments with valid context', async () => {
    setupStartRecording()
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
    setupStartRecording()
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
    setupStartRecording()

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
    setupStartRecording()

    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    sessionManager.setId('new-session-id').setTrackedWithSessionReplay()
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    flushSegment(lifeCycle)

    const requests = await readSentRequests(1)
    expect(requests[0].metadata.records_count).toBe(1)
    expect(requests[0].metadata.session.id).toBe('new-session-id')
  })

  it('flushes pending mutations before ending the view', async () => {
    setupStartRecording()

    appendElement('<hr/>')
    changeView(lifeCycle)
    flushSegment(lifeCycle)

    const requests = await readSentRequests(2)
    const firstSegment = requests[0].segment
    expect(firstSegment.records[firstSegment.records.length - 2].type).toBe(RecordType.IncrementalSnapshot)
    expect(firstSegment.records[firstSegment.records.length - 1].type).toBe(RecordType.ViewEnd)

    const secondSegment = requests[1].segment
    expect(secondSegment.records[0].type).toBe(RecordType.Meta)
  })

  it('flushes pending mutations before ending the view, even after the segment has been flushed', async () => {
    setupStartRecording()

    // flush segment right before the view change to set the segment collection in the waiting state
    flushSegment(lifeCycle)
    changeView(lifeCycle)
    flushSegment(lifeCycle)

    const requests = await readSentRequests(3)
    const secondSegment = requests[1].segment

    expect(secondSegment.records[0].type).toBe(RecordType.ViewEnd)
  })

  it('does not split Meta, Focus and FullSnapshot records between multiple segments when taking a full snapshot', async () => {
    setSegmentBytesLimit(0)
    setupStartRecording()

    const requests = await readSentRequests(1)
    expect(requests[0].segment.records[0].type).toBe(RecordType.Meta)
    expect(requests[0].segment.records[1].type).toBe(RecordType.Focus)
    expect(requests[0].segment.records[2].type).toBe(RecordType.FullSnapshot)
  })

  describe('when calling stop()', () => {
    it('stops collecting records', async () => {
      setupStartRecording()

      document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))
      stopRecording()
      document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))
      flushSegment(lifeCycle)

      const requests = await readSentRequests(1)
      expect(requests[0].metadata.records_count).toBe(1 + recordsPerFullSnapshot())
    })

    it('stops taking full snapshots on view creation', async () => {
      setupStartRecording()

      stopRecording()
      changeView(lifeCycle)
      flushSegment(lifeCycle)

      const requests = await readSentRequests(1)
      expect(requests[0].metadata.records_count).toBe(recordsPerFullSnapshot())
    })
  })

  it('should send records through the bridge when it is present', () => {
    const eventBridge = mockEventBridge()
    setupStartRecording()
    const sendSpy = spyOn(eventBridge, 'send')

    // send click record
    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    // send view end record and meta record
    changeView(lifeCycle)

    const record1 = JSON.parse(sendSpy.calls.argsFor(0)[0])
    const record2 = JSON.parse(sendSpy.calls.argsFor(1)[0])
    const record3 = JSON.parse(sendSpy.calls.argsFor(2)[0])

    expect(record1).toEqual({
      eventType: 'record',
      event: jasmine.objectContaining({ type: RecordType.IncrementalSnapshot }),
      view: { id: 'view-id' },
    })

    expect(record2).toEqual({
      eventType: 'record',
      event: jasmine.objectContaining({ type: RecordType.ViewEnd }),
      view: { id: 'view-id' },
    })

    expect(record3).toEqual({
      eventType: 'record',
      event: jasmine.objectContaining({ type: RecordType.Meta }),
      view: { id: 'view-id-2' },
    })
  })

  function initialView(lifeCycle: LifeCycle) {
    const viewCreatedEvent = { id: viewId, startClocks: { relative: 1, timeStamp: VIEW_TIMESTAMP } } as ViewCreatedEvent
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, viewCreatedEvent)
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, viewCreatedEvent)
  }

  function changeView(lifeCycle: LifeCycle) {
    const viewEndedEvent = { endClocks: { relative: 2, timeStamp: 2 as TimeStamp } } as ViewEndedEvent
    viewId = 'view-id-2'
    const viewCreatedEvent = {
      id: viewId,
      startClocks: { relative: 1, timeStamp: VIEW_TIMESTAMP },
    } as ViewCreatedEvent
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, viewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, viewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, viewCreatedEvent)
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, viewCreatedEvent)
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
