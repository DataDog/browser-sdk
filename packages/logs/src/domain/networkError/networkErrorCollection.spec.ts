import { isIE, ErrorSource } from '@datadog/browser-core'
import type { MockFetch, MockFetchManager } from '@datadog/browser-core/test'
import { SPEC_ENDPOINTS, MockResponse, mockFetch, registerCleanupTask } from '@datadog/browser-core/test'
import type { RawNetworkLogsEvent } from '../../rawLogsEvent.types'
import type { LogsConfiguration } from '../configuration'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'

import {
  computeFetchErrorText,
  computeFetchResponseText,
  computeXhrResponseData,
  startNetworkErrorCollection,
} from './networkErrorCollection'

const CONFIGURATION = {
  requestErrorResponseLengthLimit: 64,
  ...SPEC_ENDPOINTS,
} as LogsConfiguration

describe('network error collection', () => {
  let fetch: MockFetch
  let mockFetchManager: MockFetchManager
  let stopNetworkErrorCollection: () => void
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
    ;({ stop: stopNetworkErrorCollection } = startNetworkErrorCollection(
      { ...CONFIGURATION, forwardErrorsToLogs },
      lifeCycle
    ))
    fetch = window.fetch as MockFetch
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawNetworkLogsEvent>)
    )

    registerCleanupTask(() => {
      stopNetworkErrorCollection()
    })
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
    fetch('https://logs-intake.com/v1/input/send?foo=bar').resolveWith(DEFAULT_REQUEST)

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
})

describe('computeXhrResponseData', () => {
  it('computes response text from XHR', (done) => {
    const xhr = { response: 'foo' } as XMLHttpRequest
    computeXhrResponseData(xhr, CONFIGURATION, (responseData) => {
      expect(responseData).toBe('foo')
      done()
    })
  })

  it('return the response value directly if it is not a string', (done) => {
    const xhr = { response: { foo: 'bar' } } as XMLHttpRequest
    computeXhrResponseData(xhr, CONFIGURATION, (responseData) => {
      expect(responseData).toEqual({ foo: 'bar' })
      done()
    })
  })

  it('truncates xhr response text', (done) => {
    const xhr = { response: 'Lorem ipsum dolor sit amet orci aliquam.' } as XMLHttpRequest
    computeXhrResponseData(xhr, { ...CONFIGURATION, requestErrorResponseLengthLimit: 32 }, (responseData) => {
      expect(responseData).toBe('Lorem ipsum dolor sit amet orci ...')
      done()
    })
  })
})

describe('computeFetchResponseText', () => {
  let onunhandledrejectionSpy: jasmine.Spy

  beforeEach(() => {
    if (isIE()) {
      pending('IE does not support the fetch API')
    }

    onunhandledrejectionSpy = jasmine.createSpy()
    window.onunhandledrejection = onunhandledrejectionSpy

    registerCleanupTask(() => {
      window.onunhandledrejection = null
    })
  })

  it('computes response text from Response objects', (done) => {
    computeFetchResponseText(new MockResponse({ responseText: 'foo' }), CONFIGURATION, (responseText) => {
      expect(responseText).toBe('foo')
      done()
    })
  })

  // https://fetch.spec.whatwg.org/#concept-body-consume-body
  it('computes response text from Response objects failing to retrieve text', (done) => {
    computeFetchResponseText(
      new MockResponse({ responseTextError: new Error('locked') }),
      CONFIGURATION,
      (responseText) => {
        expect(responseText).toBe('Unable to retrieve response: Error: locked')
        done()
      }
    )
  })

  it('should return undefined if no response body', (done) => {
    const response = new MockResponse({})
    computeFetchResponseText(response, CONFIGURATION, (responseText) => {
      expect(responseText).toBeUndefined()
      done()
    })
  })

  it('should return undefined if body used by another instrumentation', (done) => {
    const response = new MockResponse({ bodyUsed: true })
    computeFetchResponseText(response, CONFIGURATION, (responseText) => {
      expect(responseText).toBeUndefined()
      done()
    })
  })

  it('should return undefined if body is disturbed', (done) => {
    const response = new MockResponse({ bodyDisturbed: true })
    computeFetchResponseText(response, CONFIGURATION, (responseText) => {
      expect(responseText).toBeUndefined()
      done()
    })
  })

  it('does not consume the response body', (done) => {
    const response = new MockResponse({ responseText: 'foo' })
    computeFetchResponseText(response, CONFIGURATION, () => {
      expect(response.bodyUsed).toBe(false)
      done()
    })
  })

  it('does not truncate the response if its size is equal to the limit', (done) => {
    const text = 'foo'
    computeFetchResponseText(
      new MockResponse({ responseText: text }),
      { ...CONFIGURATION, requestErrorResponseLengthLimit: text.length },
      (responseData) => {
        expect(responseData).toBe(text)
        done()
      }
    )
  })

  it('truncates the response if its size is greater than the limit', (done) => {
    const text = 'foobar'
    computeFetchResponseText(
      new MockResponse({ responseText: text }),
      { ...CONFIGURATION, requestErrorResponseLengthLimit: text.length - 1 },
      (responseData) => {
        expect(responseData).toBe('fooba...')
        done()
      }
    )
  })
})

describe('computeFetchErrorText', () => {
  it('computes response text from requests ending as an error', (done) => {
    computeFetchErrorText(new Error('fetch error'), CONFIGURATION, (errorText) => {
      expect(errorText).toContain('Error: fetch error')
      done()
    })
  })
})
