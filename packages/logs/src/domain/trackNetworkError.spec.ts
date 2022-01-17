import type { RawError } from '@datadog/browser-core'
import { isIE, Observable } from '@datadog/browser-core'
import type { FetchStub, FetchStubManager } from '../../../core/test/specHelper'
import { SPEC_ENDPOINTS, ResponseStub, stubFetch } from '../../../core/test/specHelper'
import type { LogsConfiguration } from './configuration'

import {
  computeFetchErrorText,
  computeFetchResponseText,
  computeXhrResponseData,
  trackNetworkError,
} from './trackNetworkError'

const CONFIGURATION = {
  requestErrorResponseLengthLimit: 64,
  ...SPEC_ENDPOINTS,
} as LogsConfiguration

describe('network error tracker', () => {
  let errorObservableSpy: jasmine.Spy
  let fetchStub: FetchStub
  let fetchStubManager: FetchStubManager
  let stopNetworkErrorTracking: () => void
  let errorObservable: Observable<RawError>
  const FAKE_URL = 'http://fake.com/'
  const DEFAULT_REQUEST = {
    duration: 10,
    method: 'GET',
    responseText: 'Server error',
    startTime: 0,
    status: 503,
    url: FAKE_URL,
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    errorObservable = new Observable<RawError>()
    errorObservableSpy = spyOn(errorObservable, 'notify')

    fetchStubManager = stubFetch()
    ;({ stop: stopNetworkErrorTracking } = trackNetworkError(CONFIGURATION, errorObservable))
    fetchStub = window.fetch as FetchStub
  })

  afterEach(() => {
    stopNetworkErrorTracking()
    fetchStubManager.reset()
  })

  it('should track server error', (done) => {
    fetchStub(FAKE_URL).resolveWith(DEFAULT_REQUEST)

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalledWith({
        message: 'Fetch error GET http://fake.com/',
        resource: {
          method: 'GET',
          statusCode: 503,
          url: 'http://fake.com/',
        },
        source: 'network',
        stack: 'Server error',
        startClocks: jasmine.any(Object),
      })
      done()
    })
  })

  it('should not track intake error', (done) => {
    fetchStub('https://logs-intake.com/v1/input/send?foo=bar').resolveWith(DEFAULT_REQUEST)

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).not.toHaveBeenCalled()
      done()
    })
  })

  it('should track aborted requests ', (done) => {
    fetchStub(FAKE_URL).abort()

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      done()
    })
  })

  it('should track refused request', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 0 })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      done()
    })
  })

  it('should not track client error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 400 })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).not.toHaveBeenCalled()
      done()
    })
  })

  it('should not track successful request', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 200 })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).not.toHaveBeenCalled()
      done()
    })
  })

  it('uses a fallback when the response text is empty', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, responseText: '' })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      const stack = (errorObservableSpy.calls.mostRecent().args[0] as RawError).stack
      expect(stack).toEqual('Failed to load')
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
  })

  afterEach(() => {
    window.onunhandledrejection = null
  })

  it('computes response text from Response objects', (done) => {
    computeFetchResponseText(new ResponseStub({ responseText: 'foo' }), CONFIGURATION, (responseText) => {
      expect(responseText).toBe('foo')
      done()
    })
  })

  // https://fetch.spec.whatwg.org/#concept-body-consume-body
  it('computes response text from Response objects failing to retrieve text', (done) => {
    computeFetchResponseText(
      new ResponseStub({ responseTextError: new Error('locked') }),
      CONFIGURATION,
      (responseText) => {
        expect(responseText).toBe('Unable to retrieve response: Error: locked')
        done()
      }
    )
  })

  it('does not consume the response body', (done) => {
    const response = new ResponseStub({ responseText: 'foo' })
    computeFetchResponseText(response, CONFIGURATION, () => {
      expect(response.bodyUsed).toBe(false)
      done()
    })
  })

  it('reads a limited amount of bytes from the response', (done) => {
    // Creates a response that stream "f" indefinitely, one byte at a time
    const cancelSpy = jasmine.createSpy()
    const pullSpy = jasmine.createSpy().and.callFake((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new TextEncoder().encode('f'))
    })
    const response = new ResponseStub({
      body: new ReadableStream({
        pull: pullSpy,
        cancel: cancelSpy,
      }),
    })

    computeFetchResponseText(response, CONFIGURATION, () => {
      expect(pullSpy).toHaveBeenCalledTimes(
        // readLimitedAmountOfBytes may read one more byte than necessary to make sure it exceeds the limit
        CONFIGURATION.requestErrorResponseLengthLimit + 1
      )
      expect(cancelSpy).toHaveBeenCalledTimes(1)
      done()
    })
  })

  it('truncates the response if its size is greater than the limit', (done) => {
    const text = 'foobar'
    computeFetchResponseText(
      new ResponseStub({ responseText: text }),
      { ...CONFIGURATION, requestErrorResponseLengthLimit: text.length - 1 },
      (responseData) => {
        expect(responseData).toBe('fooba...')
        done()
      }
    )
  })

  it('does not truncate the response if its size is equal to the limit', (done) => {
    const text = 'foo'
    computeFetchResponseText(
      new ResponseStub({ responseText: text }),
      { ...CONFIGURATION, requestErrorResponseLengthLimit: text.length },
      (responseData) => {
        expect(responseData).toBe(text)
        done()
      }
    )
  })

  it('does not yield an unhandled rejection error if the cancel promise is rejected', (done) => {
    // Creates a response that stream "f" indefinitely and fails to be canceled
    const response = new ResponseStub({
      body: new ReadableStream({
        pull: (controller) => controller.enqueue(new TextEncoder().encode('f')),
        cancel: () => Promise.reject(new Error('foo')),
      }),
    })

    computeFetchResponseText(response, CONFIGURATION, () => {
      setTimeout(() => {
        expect(onunhandledrejectionSpy).not.toHaveBeenCalled()
        done()
      })
    })
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
