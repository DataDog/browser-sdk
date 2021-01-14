import { createNewEvent, HttpRequest, isIE } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'

import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'

import { startRecording } from './recorder'

describe('startRecording', () => {
  let setupBuilder: TestSetupBuilder
  let sessionId: string | undefined

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
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('starts recording', (done) => {
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

    const { lifeCycle } = setupBuilder.build()
    renewSegment(lifeCycle)
  })

  it('renews the segment when its compressed data is getting too large', (done) => {
    const clickCount = 10_000
    waitRequests((requests) => {
      expect(requests.length).toBe(1)
      expect(requests[0].data.get('records_count')).toBe(String(clickCount + 2))
      done()
    })

    setupBuilder.build()
    const click = createNewEvent('click')
    for (let i = 0; i < clickCount; i += 1) {
      document.body.dispatchEvent(click)
    }
  })

  it('stops sending new segment when the session is expired', (done) => {
    waitRequests((requests) => {
      expect(requests.length).toBe(1)
      expect(requests[0].data.get('records_count')).toBe('3')
      done()
    })

    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click'))

    sessionId = undefined
    renewSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click'))

    renewSegment(lifeCycle)
  })

  it('restarts sending segments when the session is renewed', (done) => {
    waitRequests((requests) => {
      expect(requests.length).toBe(1)
      expect(requests[0].data.get('records_count')).toBe('1')
      expect(requests[0].data.get('session.id')).toBe('new-session-id')
      done()
    })

    sessionId = undefined
    const { lifeCycle } = setupBuilder.build()

    document.body.dispatchEvent(createNewEvent('click'))

    sessionId = 'new-session-id'
    renewSegment(lifeCycle)
    document.body.dispatchEvent(createNewEvent('click'))

    renewSegment(lifeCycle)
  })
})

function renewSegment(lifeCycle: LifeCycle) {
  lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
}

function formDataAsObject(data: FormData) {
  const result: { [key: string]: unknown } = {}
  data.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function waitRequests(callback: (requests: Array<{ data: FormData; size: number }>) => void) {
  const requests: Array<{ data: FormData; size: number }> = []
  let isWaiting = false
  spyOn(HttpRequest.prototype, 'send').and.callFake((data: FormData, size) => {
    requests.push({ data, size })
    if (!isWaiting) {
      isWaiting = true
      // Delay the callback, so it is called only after the last request being sent
      setTimeout(() => callback(requests), 300)
    }
  })
}
