import { HttpRequest, DefaultPrivacyLevel, noop, isIE } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { inflate } from 'pako'
import { createRumSessionManagerMock, RumSessionManagerMock } from '../../../rum-core/test/mockRumSessionManager'
import { createNewEvent } from '../../../core/test/specHelper'

import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'
import { collectAsyncCalls } from '../../test/utils'
import { setMaxSegmentSize } from '../domain/segmentCollection/segmentCollection'

import { Segment, RecordType } from '../types'
import { doStartDeflateWorker } from '../domain/segmentCollection/startDeflateWorker'
import { startRecording } from './startRecording'

describe('startRecording', () => {
  let setupBuilder: TestSetupBuilder
  let sessionManager: RumSessionManagerMock
  let viewId: string
  let waitRequestSendCalls: (
    expectedCallsCount: number,
    callback: (calls: jasmine.Calls<HttpRequest['send']>) => void
  ) => void
  let sandbox: HTMLElement
  let textField: HTMLInputElement
  let expectNoExtraRequestSendCalls: (done: () => void) => void
  let stopRecording: () => void

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    sessionManager = createRumSessionManagerMock()
    viewId = 'view-id'

    sandbox = document.createElement('div')
    document.body.appendChild(sandbox)
    textField = document.createElement('input')
    sandbox.appendChild(textField)

    const requestSendSpy = spyOn(HttpRequest.prototype, 'send')
    ;({
      waitAsyncCalls: waitRequestSendCalls,
      expectNoExtraAsyncCall: expectNoExtraRequestSendCalls,
    } = collectAsyncCalls(requestSendSpy))

    setupBuilder = setup()
      .withParentContexts({
        findView() {
          return {
            view: {
              id: viewId,
            },
          }
        },
      })
      .withSessionManager(sessionManager)
      .withConfiguration({
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      })
      .beforeBuild(({ lifeCycle, configuration, parentContexts, sessionManager }) => {
        const recording = startRecording(
          lifeCycle,
          configuration,
          sessionManager,
          parentContexts,
          doStartDeflateWorker()!
        )
        stopRecording = recording ? recording.stop : noop
        return { stop: stopRecording }
      })
  })

  afterEach(() => {
    sandbox.remove()
    setMaxSegmentSize()
    setupBuilder.cleanup()
  })

  it('sends recorded segments with valid context', (done) => {
    const { lifeCycle } = setupBuilder.build()
    flushSegment(lifeCycle)

    waitRequestSendCalls(1, (calls) => {
      expect(calls.first().args).toEqual([jasmine.any(FormData), jasmine.any(Number), 'before_unload'])
      expect(getRequestData(calls.first())).toEqual({
        'application.id': 'appId',
        creation_reason: 'init',
        end: jasmine.stringMatching(/^\d{13}$/),
        has_full_snapshot: 'true',
        records_count: '3',
        segment: jasmine.any(File),
        'session.id': 'session-id',
        start: jasmine.stringMatching(/^\d{13}$/),
        raw_segment_size: jasmine.stringMatching(/^\d+$/),
        'view.id': 'view-id',
      })
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('flushes the segment when its compressed data is getting too large', (done) => {
    setupBuilder.build()
    const inputCount = 150
    const inputEvent = createNewEvent('input', { target: textField })
    for (let i = 0; i < inputCount; i += 1) {
      // Create a random value harder to deflate, so we don't have to send too many events to reach
      // the limit.
      textField.value = createRandomString(1000)
      document.body.dispatchEvent(inputEvent)
    }

    waitRequestSendCalls(1, (calls) => {
      expect(getRequestData(calls.first()).records_count).toBe(String(inputCount + 3))
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('stops sending new segment when the session is expired', (done) => {
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click'))

    sessionManager.setNotTracked()
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click'))

    flushSegment(lifeCycle)

    waitRequestSendCalls(1, (calls) => {
      expect(getRequestData(calls.first()).records_count).toBe('4')
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('restarts sending segments when the session is renewed', (done) => {
    sessionManager.setNotTracked()
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click'))

    sessionManager.setId('new-session-id').setReplayPlan()
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click'))

    flushSegment(lifeCycle)

    waitRequestSendCalls(1, (calls) => {
      const data = getRequestData(calls.first())
      expect(data.records_count).toBe('1')
      expect(data['session.id']).toBe('new-session-id')
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('takes a full snapshot when the view changes', (done) => {
    const { lifeCycle } = setupBuilder.build()

    changeView(lifeCycle)
    flushSegment(lifeCycle)

    waitRequestSendCalls(2, (calls) => {
      expect(getRequestData(calls.mostRecent()).has_full_snapshot).toBe('true')
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('adds a ViewEnd record when the view ends', (done) => {
    const { lifeCycle } = setupBuilder.build()

    changeView(lifeCycle)
    flushSegment(lifeCycle)

    waitRequestSendCalls(2, (calls) => {
      expect(getRequestData(calls.first())['view.id']).toBe('view-id')
      readRequestSegment(calls.first(), (segment) => {
        expect(segment.records[segment.records.length - 1].type).toBe(RecordType.ViewEnd)
        expectNoExtraRequestSendCalls(done)
      })
    })
  })

  it('flushes pending mutations before ending the view', (done) => {
    const { lifeCycle } = setupBuilder.build()

    sandbox.appendChild(document.createElement('hr'))
    changeView(lifeCycle)
    flushSegment(lifeCycle)

    waitRequestSendCalls(2, (calls) => {
      readRequestSegment(calls.first(), (segment) => {
        expect(segment.records[segment.records.length - 2].type).toBe(RecordType.IncrementalSnapshot)
        expect(segment.records[segment.records.length - 1].type).toBe(RecordType.ViewEnd)

        readRequestSegment(calls.mostRecent(), (segment) => {
          expect(segment.records[0].type).toBe(RecordType.Meta)
          expectNoExtraRequestSendCalls(done)
        })
      })
    })
  })

  // eslint-disable-next-line max-len
  it('does not split Meta, Focus and FullSnapshot records between multiple segments when taking a full snapshot', (done) => {
    setMaxSegmentSize(0)
    setupBuilder.build()

    waitRequestSendCalls(1, (calls) => {
      readRequestSegment(calls.first(), (segment) => {
        expect(segment.records[0].type).toBe(RecordType.Meta)
        expect(segment.records[1].type).toBe(RecordType.Focus)
        expect(segment.records[2].type).toBe(RecordType.FullSnapshot)
        expectNoExtraRequestSendCalls(done)
      })
    })
  })

  describe('when calling stop()', () => {
    it('stops collecting records', (done) => {
      const { lifeCycle } = setupBuilder.build()

      document.body.dispatchEvent(createNewEvent('click'))
      stopRecording()
      document.body.dispatchEvent(createNewEvent('click'))
      flushSegment(lifeCycle)

      waitRequestSendCalls(1, (calls) => {
        expect(getRequestData(calls.first()).records_count).toBe('4')
        expectNoExtraRequestSendCalls(done)
      })
    })

    it('stops taking full snapshots on view creation', (done) => {
      const { lifeCycle } = setupBuilder.build()

      stopRecording()
      changeView(lifeCycle)
      flushSegment(lifeCycle)

      waitRequestSendCalls(1, (calls) => {
        expect(getRequestData(calls.first()).records_count).toBe('3')
        expectNoExtraRequestSendCalls(done)
      })
    })
  })

  function changeView(lifeCycle: LifeCycle) {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)
    viewId = 'view-id-2'
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)
  }
})

function flushSegment(lifeCycle: LifeCycle) {
  lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
}

function getRequestData(call: jasmine.CallInfo<HttpRequest['send']>) {
  const result: { [key: string]: unknown } = {}
  getRequestFormData(call).forEach((value, key) => {
    result[key] = value
  })
  return result
}

function readRequestSegment(call: jasmine.CallInfo<HttpRequest['send']>, callback: (segment: Segment) => void) {
  const encodedSegment = getRequestFormData(call).get('segment')
  expect(encodedSegment).toBeInstanceOf(Blob)
  const reader = new FileReader()
  reader.addEventListener('loadend', () => {
    const textDecoder = new TextDecoder()
    callback(JSON.parse(textDecoder.decode(inflate(reader.result as Uint8Array))))
  })
  reader.readAsArrayBuffer(encodedSegment as Blob)
}

function getRequestFormData(call: jasmine.CallInfo<HttpRequest['send']>) {
  const data = call.args[0]
  expect(data).toEqual(jasmine.any(FormData))
  return data as FormData
}

function createRandomString(minLength: number) {
  let result = ''
  while (result.length < minLength) {
    result += Math.random().toString(36)
  }
  return result
}
