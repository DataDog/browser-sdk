import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { TimeStamp, HttpRequest, HttpRequestEvent, Telemetry } from '@datadog/browser-core'
import {
  PageExitReason,
  DefaultPrivacyLevel,
  noop,
  DeflateEncoderStreamId,
  Observable,
  ExperimentalFeature,
  addExperimentalFeatures,
} from '@datadog/browser-core'
import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType, startViewHistory } from '@datadog/browser-rum-core'
import {
  collectAsyncCalls,
  createNewEvent,
  mockEventBridge,
  mockExperimentalFeatures,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import type { ViewEndedEvent } from '@datadog/browser-rum-core/src/domain/view/trackViews'
import type { RumSessionManagerMock } from '../../../rum-core/test'
import { appendElement, createRumSessionManagerMock, mockRumConfiguration } from '../../../rum-core/test'

import { recordsPerFullSnapshot, readReplayPayload } from '../../test'
import type { ReplayPayload } from '../domain/segmentCollection'
import { setSegmentBytesLimit } from '../domain/segmentCollection'

import { RecordType } from '../types'
import { createDeflateEncoder, resetDeflateWorkerState, startDeflateWorker } from '../domain/deflate'
import { startRecording } from './startRecording'

declare const __BUILD_ENV__WORKER_STRING__: string

const VIEW_TIMESTAMP = 1 as TimeStamp

// These tests require the deflate worker to be built. When the worker string is empty
// (unit test default), the deflate pipeline never produces results and tests hang.
describe.skipIf(!__BUILD_ENV__WORKER_STRING__)('startRecording', () => {
  const lifeCycle = new LifeCycle()
  let sessionManager: RumSessionManagerMock
  let viewId: string
  let textField: HTMLInputElement
  let requestSendSpy: Mock<HttpRequest['sendOnExit']>
  let stopRecording: () => void

  function setupStartRecording() {
    const configuration = mockRumConfiguration({ defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW })
    const worker = startDeflateWorker(configuration, 'Session Replay', noop)

    requestSendSpy = vi.fn()
    const httpRequest = {
      observable: new Observable<HttpRequestEvent<ReplayPayload>>(),
      send: requestSendSpy,
      sendOnExit: requestSendSpy,
    }

    const deflateEncoder = createDeflateEncoder(configuration, worker!, DeflateEncoderStreamId.REPLAY)
    const viewHistory = startViewHistory(lifeCycle)
    initialView(lifeCycle)

    const mockTelemetry = { enabled: true, metricsEnabled: true } as Telemetry

    const recording = startRecording(
      lifeCycle,
      configuration,
      sessionManager,
      viewHistory,
      deflateEncoder,
      mockTelemetry,
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
    sessionManager = createRumSessionManagerMock()
    viewId = 'view-id'

    textField = appendElement('<input />') as HTMLInputElement
  })

  it('sends recorded segments with valid context', async () => {
    setupStartRecording()
    flushSegment(lifeCycle)

    const requests = await readSentRequests(1)
    expect(requests[0].segment).toEqual(expect.any(Object))
    expect(requests[0].event).toEqual({
      application: {
        id: 'appId',
      },
      creation_reason: 'init',
      end: expect.stringMatching(/^\d{13}$/),
      has_full_snapshot: true,
      records_count: recordsPerFullSnapshot(),
      session: {
        id: 'session-id',
      },
      start: expect.any(Number),
      raw_segment_size: expect.any(Number),
      compressed_segment_size: expect.any(Number),
      view: {
        id: 'view-id',
      },
      index_in_view: 0,
      source: 'browser',
    })
  })

  it('sends recorded segments with valid context when Change records are enabled', async () => {
    addExperimentalFeatures([ExperimentalFeature.USE_CHANGE_RECORDS])
    setupStartRecording()
    flushSegment(lifeCycle)

    const requests = await readSentRequests(1)
    expect(requests[0].segment).toEqual(expect.any(Object))
    expect(requests[0].event).toEqual({
      application: {
        id: 'appId',
      },
      creation_reason: 'init',
      end: expect.stringMatching(/^\d{13}$/),
      has_full_snapshot: true,
      records_count: recordsPerFullSnapshot(),
      session: {
        id: 'session-id',
      },
      start: expect.any(Number),
      raw_segment_size: expect.any(Number),
      compressed_segment_size: expect.any(Number),
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
    expect(requests[0].event.records_count).toBe(inputCount + recordsPerFullSnapshot())
  })

  it('stops sending new segment when the session is expired', async () => {
    setupStartRecording()

    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    sessionManager.setNotTracked()
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    flushSegment(lifeCycle)

    const requests = await readSentRequests(1)
    expect(requests[0].event.records_count).toBe(1 + recordsPerFullSnapshot())
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
    expect(requests[0].event.records_count).toBe(1)
    expect(requests[0].event.session.id).toBe('new-session-id')
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
      expect(requests[0].event.records_count).toBe(1 + recordsPerFullSnapshot())
    })

    it('stops taking full snapshots on view creation', async () => {
      setupStartRecording()

      stopRecording()
      changeView(lifeCycle)
      flushSegment(lifeCycle)

      const requests = await readSentRequests(1)
      expect(requests[0].event.records_count).toBe(recordsPerFullSnapshot())
    })
  })

  it('should send records through the bridge when it is present', () => {
    const eventBridge = mockEventBridge()
    setupStartRecording()
    const sendSpy = vi.spyOn(eventBridge, 'send')

    // send click record
    document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))

    // send view end record and meta record
    changeView(lifeCycle)

    const record1 = JSON.parse(sendSpy.mock.calls[0][0])
    const record2 = JSON.parse(sendSpy.mock.calls[1][0])
    const record3 = JSON.parse(sendSpy.mock.calls[2][0])

    expect(record1).toEqual({
      eventType: 'record',
      event: expect.objectContaining({ type: RecordType.IncrementalSnapshot }),
      view: { id: 'view-id' },
    })

    expect(record2).toEqual({
      eventType: 'record',
      event: expect.objectContaining({ type: RecordType.ViewEnd }),
      view: { id: 'view-id' },
    })

    expect(record3).toEqual({
      eventType: 'record',
      event: expect.objectContaining({ type: RecordType.Meta }),
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
    const calls = await collectAsyncCalls(requestSendSpy, expectedSentRequestCount)
    return Promise.all(calls.all().map((call) => readReplayPayload(call.args[0])))
  }
})

function flushSegment(lifeCycle: LifeCycle) {
  lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, { reason: PageExitReason.UNLOADING })
}

function createRandomString(minLength: number) {
  let result = ''
  while (result.length < minLength) {
    result += Math.random().toString(36)
  }
  return result
}
