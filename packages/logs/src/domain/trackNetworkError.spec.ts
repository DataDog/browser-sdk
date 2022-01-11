import { isIE, Observable, RawError } from '@datadog/browser-core'
import { FetchStub, FetchStubManager, ResponseStub, SPEC_ENDPOINTS, stubFetch } from '../../../core/test/specHelper'
import { LogsConfiguration } from './configuration'

import { computeResponseData, trackNetworkError } from './trackNetworkError'

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

  it('should add a default error response text', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, responseText: undefined })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      const stack = (errorObservableSpy.calls.mostRecent().args[0] as RawError).stack
      expect(stack).toEqual('Failed to load')
      done()
    })
  })
})

describe('computeResponseData', () => {
  describe('from XHR', () => {
    it('computes response text from XHR', (done) => {
      const xhr = { response: 'foo' } as XMLHttpRequest
      computeResponseData({ xhr }, CONFIGURATION, (responseData) => {
        expect(responseData).toBe('foo')
        done()
      })
    })

    it('return the response value directly if it is not a string', (done) => {
      const xhr = { response: { foo: 'bar' } } as XMLHttpRequest
      computeResponseData({ xhr }, CONFIGURATION, (responseData) => {
        expect(responseData).toEqual({ foo: 'bar' })
        done()
      })
    })
  })

  describe('from Response objects', () => {
    beforeEach(() => {
      if (isIE()) {
        pending('IE does not support the fetch API')
      }
    })

    it('computes response text from Response objects', (done) => {
      computeResponseData({ response: new ResponseStub({ responseText: 'foo' }) }, CONFIGURATION, (responseData) => {
        expect(responseData).toBe('foo')
        done()
      })
    })

    // https://fetch.spec.whatwg.org/#concept-body-consume-body
    it('computes response text from Response objects failing to retrieve text', (done) => {
      computeResponseData(
        { response: new ResponseStub({ responseTextError: new Error('locked') }) },
        CONFIGURATION,
        (responseData) => {
          expect(responseData).toBe('Unable to retrieve response: Error: locked')
          done()
        }
      )
    })

    it('does not consume the response body', (done) => {
      const response = new ResponseStub({ responseText: 'foo' })
      computeResponseData({ response }, CONFIGURATION, () => {
        expect(response.bodyUsed).toBe(false)
        done()
      })
    })
  })

  describe('from requests ending with an error', () => {
    it('computes response text from requests ending as an error', (done) => {
      computeResponseData({ error: new Error('fetch error') }, CONFIGURATION, (responseData) => {
        expect(responseData).toContain('Error: fetch error')
        done()
      })
    })
  })

  describe('fallback and formatting', () => {
    it("calls the callback even if it can't compute a response data from anything", (done) => {
      computeResponseData({}, CONFIGURATION, (responseData) => {
        expect(responseData).toBeUndefined()
        done()
      })
    })

    it('calls the callback even if the response is empty', (done) => {
      const xhr = { response: '' } as XMLHttpRequest
      computeResponseData({ xhr }, CONFIGURATION, (responseData) => {
        expect(responseData).toBe('')
        done()
      })
    })

    it('truncates error response text', (done) => {
      const xhr = { response: 'Lorem ipsum dolor sit amet orci aliquam.' } as XMLHttpRequest
      computeResponseData({ xhr }, { ...CONFIGURATION, requestErrorResponseLengthLimit: 32 }, (responseData) => {
        expect(responseData).toBe('Lorem ipsum dolor sit amet orci ...')
        done()
      })
    })
  })
})
