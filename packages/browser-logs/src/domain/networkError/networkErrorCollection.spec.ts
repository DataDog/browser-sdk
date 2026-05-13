<<<<<<< HEAD
import type { BufferedData, FetchResolveContext } from '@datadog/browser-core'
import { BufferedDataType, ErrorSource, Observable, clocksNow } from '@datadog/browser-core'
import { SPEC_ENDPOINTS, registerCleanupTask } from '@datadog/browser-core/test'
=======
import { beforeEach, describe, expect, it } from 'vitest'
<<<<<<< HEAD
import { ErrorSource } from '@datadog/browser-core'
import type { MockFetch, MockFetchManager } from '@datadog/browser-core/test'
import { SPEC_ENDPOINTS, mockFetch, registerCleanupTask } from '@datadog/browser-core/test'
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
=======
import type { BufferedData, FetchResolveContext } from '@datadog/browser-core'
import { BufferedDataType, ErrorSource, Observable, clocksNow } from '@datadog/browser-core'
import { SPEC_ENDPOINTS, registerCleanupTask } from '@datadog/browser-core/test'
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
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

const FAKE_URL = 'http://fake.com/'

const DEFAULT_FETCH_CONTEXT: FetchResolveContext = {
  state: 'resolve',
  method: 'GET',
  url: FAKE_URL,
  status: 503,
  responseBody: 'Server error',
  isAborted: false,
  handlingStack: '',
  startClocks: clocksNow(),
  input: FAKE_URL,
  isAbortedOnStart: false,
}

describe('network error collection', () => {
  let lifeCycle: LifeCycle
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawNetworkLogsEvent>>
  let bufferedDataObservable: Observable<BufferedData>

  function startCollection(forwardErrorsToLogs = true) {
    const { stop } = startNetworkErrorCollection(
      { ...CONFIGURATION, forwardErrorsToLogs },
      lifeCycle,
      bufferedDataObservable
    )
    registerCleanupTask(() => {
      stop()
    })
  }

  function notifyFetch(context: Partial<FetchResolveContext> = {}) {
    bufferedDataObservable.notify({
      type: BufferedDataType.FETCH,
      data: { ...DEFAULT_FETCH_CONTEXT, ...context },
    })
  }

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    bufferedDataObservable = new Observable<BufferedData>()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawNetworkLogsEvent>)
    )
  })

<<<<<<< HEAD
<<<<<<< HEAD
  it('should track server error', () => {
    startCollection()
    notifyFetch()

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
  })

  it('should not track network error when forwardErrorsToLogs is false', () => {
    startCollection(false)
    notifyFetch()

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should not track intake error', () => {
    startCollection()
    notifyFetch({
      url: 'https://logs-intake.com/v1/input/send?ddsource=browser&dd-api-key=xxxx&dd-request-id=1234567890',
    })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should not track aborted requests', () => {
    startCollection()
    notifyFetch({ isAborted: true, status: 0 })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should track refused request', () => {
    startCollection()
    notifyFetch({ status: 0 })

    expect(rawLogsEvents.length).toEqual(1)
  })

  it('should not track client error', () => {
    startCollection()
    notifyFetch({ status: 400 })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should not track successful request', () => {
    startCollection()
    notifyFetch({ status: 200 })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('uses a fallback when the response text is empty', () => {
    startCollection()
    notifyFetch({ responseBody: '' })

    expect(rawLogsEvents.length).toEqual(1)
    expect(rawLogsEvents[0].rawLogsEvent.error.stack).toEqual('Failed to load')
  })
=======
  it('should track server error', () =>
    new Promise<void>((resolve) => {
      startCollection()
      fetch(FAKE_URL).resolveWith(DEFAULT_REQUEST)
=======
  it('should track server error', () => {
    startCollection()
    notifyFetch()
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))

    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      message: 'Fetch error GET http://fake.com/',
      date: expect.any(Number),
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
  })

  it('should not track network error when forwardErrorsToLogs is false', () => {
    startCollection(false)
    notifyFetch()

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should not track intake error', () => {
    startCollection()
    notifyFetch({
      url: 'https://logs-intake.com/v1/input/send?ddsource=browser&dd-api-key=xxxx&dd-request-id=1234567890',
    })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should not track aborted requests', () => {
    startCollection()
    notifyFetch({ isAborted: true, status: 0 })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should track refused request', () => {
    startCollection()
    notifyFetch({ status: 0 })

    expect(rawLogsEvents.length).toEqual(1)
  })

  it('should not track client error', () => {
    startCollection()
    notifyFetch({ status: 400 })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should not track successful request', () => {
    startCollection()
    notifyFetch({ status: 200 })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('uses a fallback when the response text is empty', () => {
    startCollection()
    notifyFetch({ responseBody: '' })

<<<<<<< HEAD
      mockFetchManager.whenAllComplete(() => {
        expect(rawLogsEvents.length).toEqual(1)
        expect(rawLogsEvents[0].rawLogsEvent.error.stack).toEqual('Failed to load')
        resolve()
      })
    }))
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
=======
    expect(rawLogsEvents.length).toEqual(1)
    expect(rawLogsEvents[0].rawLogsEvent.error.stack).toEqual('Failed to load')
  })
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))

  describe('response body handling', () => {
    beforeEach(() => {
      startCollection()
    })

<<<<<<< HEAD
<<<<<<< HEAD
    it('should use responseBody for fetch server errors', () => {
      const responseBody = 'Internal Server Error Details'
      notifyFetch({ url: 'http://fake-url/', status: 500, responseBody })

      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack).toBe(responseBody)
    })

    it('should use error stack trace for fetch rejections', () => {
      const error = new Error('Network failure')
      notifyFetch({ url: 'http://fake-url/', status: 0, error, responseBody: undefined })

      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack).toContain('Error: Network failure')
    })

    it('should truncate responseBody according to limit', () => {
      const longResponse = 'a'.repeat(100)
      notifyFetch({ url: 'http://fake-url/', status: 500, responseBody: longResponse })

      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack?.length).toBe(67) // 64 chars + '...'
      expect(log.error.stack).toMatch(/^a{64}\.\.\.$/)
    })

    it('should use fallback message when no responseBody available', () => {
      notifyFetch({ url: 'http://fake-url/', status: 500, responseBody: undefined })

      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack).toBe('Failed to load')
    })
=======
    it('should use responseBody for fetch server errors', () =>
      new Promise<void>((resolve) => {
        const responseBody = 'Internal Server Error Details'
        fetch('http://fake-url/').resolveWith({
          status: 500,
          responseText: responseBody,
        })
=======
    it('should use responseBody for fetch server errors', () => {
      const responseBody = 'Internal Server Error Details'
      notifyFetch({ url: 'http://fake-url/', status: 500, responseBody })
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))

      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack).toBe(responseBody)
    })

    it('should use error stack trace for fetch rejections', () => {
      const error = new Error('Network failure')
      notifyFetch({ url: 'http://fake-url/', status: 0, error, responseBody: undefined })

      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack).toContain('Error: Network failure')
    })

    it('should truncate responseBody according to limit', () => {
      const longResponse = 'a'.repeat(100)
      notifyFetch({ url: 'http://fake-url/', status: 500, responseBody: longResponse })

      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack?.length).toBe(67) // 64 chars + '...'
      expect(log.error.stack).toMatch(/^a{64}\.\.\.$/)
    })

    it('should use fallback message when no responseBody available', () => {
      notifyFetch({ url: 'http://fake-url/', status: 500, responseBody: undefined })

<<<<<<< HEAD
    it('should use fallback message when no responseBody available', () =>
      new Promise<void>((resolve) => {
        fetch('http://fake-url/').resolveWith({ status: 500 })

        mockFetchManager.whenAllComplete(() => {
          const log = rawLogsEvents[0].rawLogsEvent
          expect(log.error.stack).toBe('Failed to load')
          resolve()
        })
      }))

    it('should use fallback message when response body is already used', () =>
      new Promise<void>((resolve) => {
        fetch('http://fake-url/').resolveWith({ status: 500, bodyUsed: true })

        mockFetchManager.whenAllComplete(() => {
          const log = rawLogsEvents[0].rawLogsEvent
          expect(log.error.stack).toBe('Failed to load')
          resolve()
        })
      }))

    it('should use fallback message when response body is disturbed', () =>
      new Promise<void>((resolve) => {
        fetch('http://fake-url/').resolveWith({ status: 500, bodyDisturbed: true })

        mockFetchManager.whenAllComplete(() => {
          const log = rawLogsEvents[0].rawLogsEvent
          expect(log.error.stack).toBe('Failed to load')
          resolve()
        })
      }))
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
=======
      const log = rawLogsEvents[0].rawLogsEvent
      expect(log.error.stack).toBe('Failed to load')
    })
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
  })
})
