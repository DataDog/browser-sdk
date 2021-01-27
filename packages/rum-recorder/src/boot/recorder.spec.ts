import { createNewEvent, HttpRequest, isIE } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'

import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'

import { expectNoExtraCall, waitCalls } from '../../test/utils'
import { startRecording } from './recorder'

describe('startRecording', () => {
  let setupBuilder: TestSetupBuilder
  let sessionId: string | undefined
  let waitRequestSendCalls: (
    expectedCallsCount: number,
    callback: (calls: jasmine.Calls<HttpRequest['send']>) => void
  ) => void
  let expectNoExtraRequestSendCalls: (done: () => void) => void

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    sessionId = 'session-id'
    setupBuilder = setup()
      .withParentContexts({
        findView() {
          return {
            session: {
              id: sessionId,
            },
            view: {
              id: 'view-id',
              referrer: '',
              url: 'http://example.org',
            },
          }
        },
      })
      .beforeBuild(({ lifeCycle, applicationId, configuration, parentContexts, session }) =>
        startRecording(lifeCycle, applicationId, configuration, session, parentContexts)
      )

    const requestSendSpy = spyOn(HttpRequest.prototype, 'send')
    expectNoExtraRequestSendCalls = expectNoExtraCall.bind(null, requestSendSpy)
    waitRequestSendCalls = waitCalls.bind(null, requestSendSpy)
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('sends recorded segments with valid context', (done) => {
    const { lifeCycle } = setupBuilder.build()
    flushSegment(lifeCycle)

    waitRequestSendCalls(1, (calls) => {
      expect(calls.first().args).toEqual([jasmine.any(FormData), jasmine.any(Number)])
      expect(getRequestData(calls.first())).toEqual({
        'application.id': 'appId',
        creation_reason: 'init',
        end: jasmine.stringMatching(/^\d{13}$/),
        has_full_snapshot: 'true',
        records_count: '2',
        segment: jasmine.any(File),
        'session.id': 'session-id',
        start: jasmine.stringMatching(/^\d{13}$/),
        'view.id': 'view-id',
      })
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('flushes the segment when its compressed data is getting too large', (done) => {
    setupBuilder.build()
    const inputCount = 150
    const textField = document.createElement('input')
    const inputEvent = createNewEvent('input', { target: textField })
    for (let i = 0; i < inputCount; i += 1) {
      // Create a random value harder to deflate, so we don't have to send too many events to reach
      // the limit.
      textField.value = createRandomString(1000)
      document.body.dispatchEvent(inputEvent)
    }

    waitRequestSendCalls(1, (calls) => {
      expect(getRequestData(calls.first()).records_count).toBe(String(inputCount + 2))
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('stops sending new segment when the session is expired', (done) => {
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click'))

    sessionId = undefined
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click'))

    flushSegment(lifeCycle)

    waitRequestSendCalls(1, (calls) => {
      expect(getRequestData(calls.first()).records_count).toBe('3')
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('restarts sending segments when the session is renewed', (done) => {
    sessionId = undefined
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click'))

    sessionId = 'new-session-id'
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

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)

    flushSegment(lifeCycle)

    waitRequestSendCalls(2, (calls) => {
      expect(getRequestData(calls.mostRecent()).has_full_snapshot).toBe('true')
      expectNoExtraRequestSendCalls(done)
    })
  })

  it('takes a full snapshot when the session is renewed', (done) => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    flushSegment(lifeCycle)

    waitRequestSendCalls(2, (calls) => {
      expect(getRequestData(calls.mostRecent()).has_full_snapshot).toBe('true')
      expectNoExtraRequestSendCalls(done)
    })
  })
})

function flushSegment(lifeCycle: LifeCycle) {
  lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
}

function getRequestData(call: jasmine.CallInfo<HttpRequest['send']>) {
  const data = call.args[0]
  expect(data).toEqual(jasmine.any(FormData))
  const result: { [key: string]: unknown } = {}
  ;(data as FormData).forEach((value, key) => {
    result[key] = value
  })
  return result
}

function createRandomString(minLength: number) {
  let result = ''
  while (result.length < minLength) {
    result += Math.random().toString(36)
  }
  return result
}
