import {
  Configuration,
  DEFAULT_CONFIGURATION,
  RequestType,
  resetFetchProxy,
  resetXhrProxy,
} from '@datadog/browser-core'
import {
  FetchStub,
  FetchStubManager,
  isIE,
  SPEC_ENDPOINTS,
  stubFetch,
  stubXhr,
  withXhr,
} from '../../../core/test/specHelper'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RequestCompleteEvent, RequestStartEvent, trackFetch, trackXhr } from './requestCollection'
import { clearTracingIfNeeded, TraceIdentifier, Tracer } from './tracing/tracer'

const configuration = {
  ...DEFAULT_CONFIGURATION,
  ...SPEC_ENDPOINTS,
  maxBatchSize: 1,
}

describe('collect fetch', () => {
  const FAKE_URL = 'http://fake-url/'
  let fetchStub: FetchStub
  let fetchStubManager: FetchStubManager
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    fetchStubManager = stubFetch()

    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, startSpy)
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)
    const tracerStub: Partial<Tracer> = {
      clearTracingIfNeeded,
      traceFetch: (context) => {
        context.traceId = new TraceIdentifier()
        context.spanId = new TraceIdentifier()
      },
    }
    trackFetch(lifeCycle, configuration as Configuration, tracerStub as Tracer)

    fetchStub = window.fetch as FetchStub
    window.onunhandledrejection = (ev: PromiseRejectionEvent) => {
      throw new Error(`unhandled rejected promise \n    ${ev.reason as string}`)
    }
  })

  afterEach(() => {
    fetchStubManager.reset()
    resetFetchProxy()
    window.onunhandledrejection = null
  })

  it('should notify on request start', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      expect(startSpy).toHaveBeenCalledWith({ requestIndex: (jasmine.any(Number) as unknown) as number })
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
      expect(request.responseText).toEqual('fetch error')
      done()
    })
  })

  it('should assign a request id', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      const startRequestIndex = startSpy.calls.argsFor(0)[0].requestIndex
      const completeRequestIndex = completeSpy.calls.argsFor(0)[0].requestIndex

      expect(completeRequestIndex).toBe(startRequestIndex)
      done()
    })
  })

  it('should ignore intake requests', (done) => {
    fetchStub(SPEC_ENDPOINTS.rumEndpoint!).resolveWith({ status: 200, responseText: 'foo' })

    fetchStubManager.whenAllComplete(() => {
      expect(startSpy).not.toHaveBeenCalled()
      expect(completeSpy).not.toHaveBeenCalled()
      done()
    })
  })

  describe('tracing', () => {
    it('should trace requests by default', (done) => {
      fetchStub(FAKE_URL).resolveWith({ status: 200, responseText: 'ok' })

      fetchStubManager.whenAllComplete(() => {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.traceId).toBeDefined()
        done()
      })
    })

    it('should trace aborted requests', (done) => {
      fetchStub(FAKE_URL).abort()

      fetchStubManager.whenAllComplete(() => {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.traceId).toBeDefined()
        done()
      })
    })

    it('should not trace requests ending with status 0', (done) => {
      fetchStub(FAKE_URL).resolveWith({ status: 0, responseText: 'fetch cancelled' })

      fetchStubManager.whenAllComplete(() => {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.status).toEqual(0)
        expect(request.traceId).toBeUndefined()
        done()
      })
    })
  })
})

describe('collect xhr', () => {
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>
  let stubXhrManager: { reset(): void }

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    stubXhrManager = stubXhr()
    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, startSpy)
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)
    const tracerStub: Partial<Tracer> = {
      clearTracingIfNeeded,
      traceXhr: (context) => {
        context.traceId = new TraceIdentifier()
        context.spanId = new TraceIdentifier()
      },
    }
    trackXhr(lifeCycle, configuration as Configuration, tracerStub as Tracer)
  })

  afterEach(() => {
    resetXhrProxy()
    stubXhrManager.reset()
  })

  it('should notify on request start', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        expect(startSpy).toHaveBeenCalledWith({ requestIndex: (jasmine.any(Number) as unknown) as number })
        done()
      },
    })
  })

  it('should notify on request complete', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200, 'ok')
      },
      onComplete() {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.type).toEqual(RequestType.XHR)
        expect(request.method).toEqual('GET')
        expect(request.url).toContain('/ok')
        expect(request.status).toEqual(200)
        expect(request.responseText).toEqual('ok')
        done()
      },
    })
  })

  it('should assign a request id', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        const startRequestIndex = startSpy.calls.argsFor(0)[0].requestIndex
        const completeRequestIndex = completeSpy.calls.argsFor(0)[0].requestIndex

        expect(completeRequestIndex).toBe(startRequestIndex)
        done()
      },
    })
  })

  it('should ignore intake requests', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', SPEC_ENDPOINTS.rumEndpoint!)
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        expect(startSpy).not.toHaveBeenCalled()
        expect(completeSpy).not.toHaveBeenCalled()
        done()
      },
    })
  })

  it('should not trace cancelled requests', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(0)
      },
      onComplete() {
        const request = completeSpy.calls.argsFor(0)[0]
        expect(request.status).toEqual(0)
        expect(request.traceId).toEqual(undefined)
        done()
      },
    })
  })

  describe('tracing', () => {
    it('should trace requests by default', (done) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(200)
        },
        onComplete() {
          const request = completeSpy.calls.argsFor(0)[0]
          expect(request.traceId).toBeDefined()
          done()
        },
      })
    })

    it('should trace aborted requests', (done) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.abort()
        },
        onComplete() {
          const request = completeSpy.calls.argsFor(0)[0]
          expect(request.traceId).toBeDefined()
          done()
        },
      })
    })

    it('should not trace requests ending with status 0', (done) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(0)
        },
        onComplete() {
          const request = completeSpy.calls.argsFor(0)[0]
          expect(request.status).toEqual(0)
          expect(request.traceId).toBeUndefined()
          done()
        },
      })
    })
  })
})
