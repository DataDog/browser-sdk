import {
  FetchProxy,
  FetchStub,
  FetchStubManager,
  isIE,
  Observable,
  RequestType,
  stubFetch,
  withXhr,
} from '@datadog/browser-core'
import { resetFetchProxy } from '../../core/src/fetchProxy'
import { resetXhrProxy } from '../../core/src/xhrProxy'
import {
  RequestCompleteEvent,
  RequestObservables,
  RequestStartEvent,
  trackFetch,
  trackXhr,
} from '../src/requestCollection'
import { Tracer } from '../src/tracer'

describe('collect fetch', () => {
  const FAKE_URL = 'http://fake-url/'
  let fetchStub: FetchStub
  let fetchStubManager: FetchStubManager
  let fetchProxy: FetchProxy
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    fetchStubManager = stubFetch()

    const requestObservables: RequestObservables = [new Observable(), new Observable()]
    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    requestObservables[0].subscribe(startSpy)
    requestObservables[1].subscribe(completeSpy)
    const tracerStub: Partial<Tracer> = {
      traceFetch: () => undefined,
    }
    fetchProxy = trackFetch(requestObservables, tracerStub as Tracer)

    fetchStub = window.fetch as FetchStub
    window.onunhandledrejection = (ev: PromiseRejectionEvent) => {
      throw new Error(`unhandled rejected promise \n    ${ev.reason}`)
    }
  })

  afterEach(() => {
    fetchStubManager.reset()
    resetFetchProxy()
    // tslint:disable-next-line:no-null-keyword
    window.onunhandledrejection = null
  })

  it('should notify on request start', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      expect(startSpy).toHaveBeenCalledWith({ requestId: (jasmine.any(Number) as unknown) as number })
      done()
    })
  })

  it('should notify on request complete', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(500)
      expect(request.response).toEqual('fetch error')
      done()
    })
  })

  it('should assign a request id', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      const startRequestId = startSpy.calls.argsFor(0)[0].requestId
      const completeRequestId = completeSpy.calls.argsFor(0)[0].requestId

      expect(completeRequestId).toBe(startRequestId)
      done()
    })
  })
})

describe('collect xhr', () => {
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }

    const requestObservables: RequestObservables = [new Observable(), new Observable()]
    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    requestObservables[0].subscribe(startSpy)
    requestObservables[1].subscribe(completeSpy)
    const tracerStub: Partial<Tracer> = {
      traceXhr: () => undefined,
    }
    trackXhr(requestObservables, tracerStub as Tracer)
  })

  afterEach(() => {
    resetXhrProxy()
  })

  it('should notify on request start', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
      },
      onComplete() {
        expect(startSpy).toHaveBeenCalledWith({ requestId: (jasmine.any(Number) as unknown) as number })
        done()
      },
    })
  })

  it('should notify on request complete', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
      },
      onComplete() {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.type).toEqual(RequestType.XHR)
        expect(request.method).toEqual('GET')
        expect(request.url).toContain('/ok')
        expect(request.status).toEqual(200)
        expect(request.response).toEqual('ok')
        done()
      },
    })
  })

  it('should assign a request id', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
      },
      onComplete() {
        const startRequestId = startSpy.calls.argsFor(0)[0].requestId
        const completeRequestId = completeSpy.calls.argsFor(0)[0].requestId

        expect(completeRequestId).toBe(startRequestId)
        done()
      },
    })
  })
})
