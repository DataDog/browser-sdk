import { Configuration, Observable, RawError } from '@datadog/browser-core'
import { FetchStub, FetchStubManager, isIE, SPEC_ENDPOINTS, stubFetch } from '../../../core/test/specHelper'

import { trackNetworkError } from './trackNetworkError'

describe('network error tracker', () => {
  let errorObservableSpy: jasmine.Spy
  let fetchStub: FetchStub
  let fetchStubManager: FetchStubManager
  let stopNetworkErrorTracking: () => void
  let configuration: Configuration
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
    configuration = {
      requestErrorResponseLengthLimit: 32,
      ...SPEC_ENDPOINTS,
    } as Configuration

    fetchStubManager = stubFetch()
    ;({ stop: stopNetworkErrorTracking } = trackNetworkError(configuration, errorObservable))
    fetchStub = window.fetch as FetchStub
  })

  afterEach(() => {
    fetchStubManager.reset()
    stopNetworkErrorTracking()
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

  it('should truncate error response text', (done) => {
    fetchStub(FAKE_URL).resolveWith({
      ...DEFAULT_REQUEST,
      responseText: 'Lorem ipsum dolor sit amet orci aliquam.',
    })

    fetchStubManager.whenAllComplete(() => {
      const stack = (errorObservableSpy.calls.mostRecent().args[0] as RawError).stack
      expect(stack).toEqual('Lorem ipsum dolor sit amet orci ...')
      done()
    })
  })
})
