import { createNewEvent, HttpRequest, isIE } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'

import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'

import { startRecording } from './recorder'

describe('startRecording', () => {
  let setupBuilder: TestSetupBuilder
  let sessionId: string | undefined
  let waitRequests: (callback: (requests: ReadonlyArray<{ data: FormData; size: number }>) => void) => void

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
      .beforeBuild(({ lifeCycle, applicationId, configuration, parentContexts, session }) => {
        return startRecording(lifeCycle, applicationId, configuration, session, parentContexts)
      })

    const requestSendSpy = spyOn(HttpRequest.prototype, 'send')

    waitRequests = (callback) => {
      if (requestSendSpy.calls.first()) {
        waitForLastRequest()
      } else {
        requestSendSpy.and.callFake(waitForLastRequest)
      }

      let isWaiting = false
      function waitForLastRequest() {
        if (isWaiting) {
          return
        }
        isWaiting = true
        setTimeout(() => {
          callback(requestSendSpy.calls.allArgs().map(([data, size]) => ({ size, data: data as FormData })))
        }, 300)
      }
    }
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('sends recorded segments with valid context', (done) => {
    const { lifeCycle } = setupBuilder.build()
    flushSegment(lifeCycle)

    waitRequests((requests) => {
      expect(requests).toEqual([{ data: jasmine.any(FormData), size: jasmine.any(Number) }])
      expect(formDataAsObject(requests[0].data)).toEqual({
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
      done()
    })
  })

  it('flushes the segment when its compressed data is getting too large', (done) => {
    setupBuilder.build()
    const clickCount = 10_000
    const click = createNewEvent('click')
    for (let i = 0; i < clickCount; i += 1) {
      document.body.dispatchEvent(click)
    }

    waitRequests((requests) => {
      expect(requests.length).toBe(1)
      expect(requests[0].data.get('records_count')).toBe(String(clickCount + 2))
      done()
    })
  })

  it('stops sending new segment when the session is expired', (done) => {
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click'))

    sessionId = undefined
    flushSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click'))

    flushSegment(lifeCycle)

    waitRequests((requests) => {
      expect(requests.length).toBe(1)
      expect(requests[0].data.get('records_count')).toBe('3')
      done()
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

    waitRequests((requests) => {
      expect(requests.length).toBe(1)
      expect(requests[0].data.get('records_count')).toBe('1')
      expect(requests[0].data.get('session.id')).toBe('new-session-id')
      done()
    })
  })
})

function flushSegment(lifeCycle: LifeCycle) {
  lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
}

function formDataAsObject(data: FormData) {
  const result: { [key: string]: unknown } = {}
  data.forEach((value, key) => {
    result[key] = value
  })
  return result
}
