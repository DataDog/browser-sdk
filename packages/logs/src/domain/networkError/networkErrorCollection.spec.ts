import { ErrorSource, resetFetchObservable } from '@datadog/browser-core'
import type { MockFetch, MockFetchManager } from '@datadog/browser-core/test'
import { SPEC_ENDPOINTS, mockFetch, registerCleanupTask } from '@datadog/browser-core/test'
import type { RawNetworkLogsEvent } from '../../rawLogsEvent.types'
import type { LogsConfiguration } from '../configuration'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'

import { startNetworkErrorCollection } from './networkErrorCollection'

const CONFIGURATION = {
  requestErrorResponseLengthLimit: 64,
  ...SPEC_ENDPOINTS,
} as LogsConfiguration

describe('network error collection', () => {
  let fetch: MockFetch
  let mockFetchManager: MockFetchManager
  let lifeCycle: LifeCycle
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawNetworkLogsEvent>>
  const FAKE_URL = 'http://fake.com/'
  const DEFAULT_REQUEST = {
    duration: 10,
    method: 'GET',
    responseText: 'Server error',
    startTime: 0,
    status: 503,
    url: FAKE_URL,
  }

  function startCollection(forwardErrorsToLogs = true) {
    mockFetchManager = mockFetch()
    const { stop } = startNetworkErrorCollection({ ...CONFIGURATION, forwardErrorsToLogs }, lifeCycle)
    registerCleanupTask(() => {
      stop()
      resetFetchObservable()
    })
    fetch = window.fetch as MockFetch
  }

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawNetworkLogsEvent>)
    )
  })

  it('should track server error', (done) => {
    startCollection()
    fetch(FAKE_URL).resolveWith(DEFAULT_REQUEST)

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents[0].rawLogsEvent).toEqual({
        message: 'Fetch error GET http://fake.com/',
        date: jasmine.any(Number),
        status: StatusType.error,
        origin: ErrorSource.NETWORK,
        error: {
          stack: 'Server error',
          handling: undefined,
        },
        http: {
          method: 'GET',
          status_code: 503,
          url: 'http://fake.com/',
        },
      })
      done()
    })
  })

  it('should not track network error when forwardErrorsToLogs is false', (done) => {
    startCollection(false)
    fetch(FAKE_URL).resolveWith(DEFAULT_REQUEST)

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents.length).toEqual(0)
      done()
    })
  })

  it('should not track intake error', (done) => {
    startCollection()
    fetch(
      'https://logs-intake.com/v1/input/send?ddsource=browser&dd-api-key=xxxx&dd-request-id=1234567890'
    ).resolveWith(DEFAULT_REQUEST)

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents.length).toEqual(0)
      done()
    })
  })

  it('should track aborted requests', (done) => {
    startCollection()
    fetch(FAKE_URL).abort()

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents.length).toEqual(1)
      expect(rawLogsEvents[0].domainContext).toEqual({
        isAborted: true,
        handlingStack: jasmine.any(String),
      })
      done()
    })
  })

  it('should track refused request', (done) => {
    startCollection()
    fetch(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 0 })

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents.length).toEqual(1)
      done()
    })
  })

  it('should not track client error', (done) => {
    startCollection()
    fetch(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 400 })

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents.length).toEqual(0)
      done()
    })
  })

  it('should not track successful request', (done) => {
    startCollection()
    fetch(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 200 })

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents.length).toEqual(0)
      done()
    })
  })

  it('uses a fallback when the response text is empty', (done) => {
    startCollection()
    fetch(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, responseText: '' })

    mockFetchManager.whenAllComplete(() => {
      expect(rawLogsEvents.length).toEqual(1)
      expect(rawLogsEvents[0].rawLogsEvent.error.stack).toEqual('Failed to load')
      done()
    })
  })

  describe('response body handling', () => {
    beforeEach(() => {
      startCollection()
    })

    it('should use responseBody for fetch server errors', (done) => {
      const responseBody = 'Internal Server Error Details'
      fetch('http://fake-url/').resolveWith({
        status: 500,
        responseText: responseBody,
      })

      mockFetchManager.whenAllComplete(() => {
        const log = rawLogsEvents[0].rawLogsEvent
        expect(log.error.stack).toBe(responseBody)
        done()
      })
    })

    it('should use error stack trace for fetch rejections', (done) => {
      fetch('http://fake-url/').rejectWith(new Error('Network failure'))

      mockFetchManager.whenAllComplete(() => {
        const log = rawLogsEvents[0].rawLogsEvent
        expect(log.error.stack).toContain('Error: Network failure')
        done()
      })
    })

    it('should truncate responseBody according to limit', (done) => {
      const longResponse = 'a'.repeat(100)

      fetch('http://fake-url/').resolveWith({
        status: 500,
        responseText: longResponse,
      })

      mockFetchManager.whenAllComplete(() => {
        const log = rawLogsEvents[0].rawLogsEvent
        expect(log.error.stack?.length).toBe(67) // 64 chars + '...'
        expect(log.error.stack).toMatch(/^a{64}\.\.\.$/)
        done()
      })
    })

    it('should use fallback message when no responseBody available', (done) => {
      fetch('http://fake-url/').resolveWith({ status: 500 })

      mockFetchManager.whenAllComplete(() => {
        const log = rawLogsEvents[0].rawLogsEvent
        expect(log.error.stack).toBe('Failed to load')
        done()
      })
    })

    it('should use fallback message when response body is already used', (done) => {
      fetch('http://fake-url/').resolveWith({ status: 500, bodyUsed: true })

      mockFetchManager.whenAllComplete(() => {
        const log = rawLogsEvents[0].rawLogsEvent
        expect(log.error.stack).toBe('Failed to load')
        done()
      })
    })

    it('should use fallback message when response body is disturbed', (done) => {
      fetch('http://fake-url/').resolveWith({ status: 500, bodyDisturbed: true })

      mockFetchManager.whenAllComplete(() => {
        const log = rawLogsEvents[0].rawLogsEvent
        expect(log.error.stack).toBe('Failed to load')
        done()
      })
    })
  })
})
