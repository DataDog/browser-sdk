import type { Payload } from '@datadog/browser-core'
import { isIE, RequestType } from '@datadog/browser-core'
import type { MockFetch, MockFetchManager } from '@datadog/browser-core/test'
import { registerCleanupTask, SPEC_ENDPOINTS, mockFetch, mockXhr, withXhr } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import { trackFetch, trackXhr } from './requestCollection'
import type { Tracer } from './tracing/tracer'
import { clearTracingIfNeeded, createTraceIdentifier } from './tracing/tracer'

const DEFAULT_PAYLOAD = {} as Payload

describe('collect fetch', () => {
  const FAKE_URL = 'http://fake-url/'
  let fetch: MockFetch
  let mockFetchManager: MockFetchManager
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>
  let stopFetchTracking: () => void

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    const configuration = mockRumConfiguration({ batchMessagesLimit: 1 })
    mockFetchManager = mockFetch()

    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, startSpy)
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)
    const tracerStub: Partial<Tracer> = {
      clearTracingIfNeeded,
      traceFetch: (context) => {
        context.traceId = createTraceIdentifier()
        context.spanId = createTraceIdentifier()
      },
    }
    ;({ stop: stopFetchTracking } = trackFetch(lifeCycle, configuration, tracerStub as Tracer))

    fetch = window.fetch as MockFetch

    registerCleanupTask(() => {
      stopFetchTracking()
    })
  })

  it('should notify on request start', (done) => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      expect(startSpy).toHaveBeenCalledWith({ requestIndex: jasmine.any(Number) as unknown as number, url: FAKE_URL })
      done()
    })
  })

  it('should notify on request without body', (done) => {
    fetch(FAKE_URL).resolveWith({ status: 200 })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.handlingStack).toBeDefined()
      done()
    })
  })

  it('should notify on request with body used by another instrumentation', (done) => {
    fetch(FAKE_URL).resolveWith({ status: 200, bodyUsed: true })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.handlingStack).toBeDefined()
      done()
    })
  })

  it('should notify on request with body disturbed', (done) => {
    fetch(FAKE_URL).resolveWith({ status: 200, bodyDisturbed: true })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.handlingStack).toBeDefined()
      done()
    })
  })

  it('should notify on request complete', (done) => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(500)
      expect(request.handlingStack).toBeDefined()
      done()
    })
  })

  it('should assign a request id', (done) => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      const startRequestIndex = startSpy.calls.argsFor(0)[0].requestIndex
      const completeRequestIndex = completeSpy.calls.argsFor(0)[0].requestIndex

      expect(completeRequestIndex).toBe(startRequestIndex)
      done()
    })
  })

  it('should ignore intake requests', (done) => {
    fetch(SPEC_ENDPOINTS.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).resolveWith({
      status: 200,
      responseText: 'foo',
    })

    mockFetchManager.whenAllComplete(() => {
      expect(startSpy).not.toHaveBeenCalled()
      expect(completeSpy).not.toHaveBeenCalled()
      done()
    })
  })

  describe('tracing', () => {
    it('should trace requests by default', (done) => {
      fetch(FAKE_URL).resolveWith({ status: 200, responseText: 'ok' })

      mockFetchManager.whenAllComplete(() => {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.traceId).toBeDefined()
        done()
      })
    })

    it('should trace aborted requests', (done) => {
      fetch(FAKE_URL).abort()

      mockFetchManager.whenAllComplete(() => {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.traceId).toBeDefined()
        done()
      })
    })

    it('should not trace requests ending with status 0', (done) => {
      fetch(FAKE_URL).resolveWith({ status: 0, responseText: 'fetch cancelled' })

      mockFetchManager.whenAllComplete(() => {
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
  let stopXhrTracking: () => void

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    const configuration = mockRumConfiguration({ batchMessagesLimit: 1 })
    mockXhr()
    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, startSpy)
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)
    const tracerStub: Partial<Tracer> = {
      clearTracingIfNeeded,
      traceXhr: (context) => {
        context.traceId = createTraceIdentifier()
        context.spanId = createTraceIdentifier()
      },
    }
    ;({ stop: stopXhrTracking } = trackXhr(lifeCycle, configuration, tracerStub as Tracer))

    registerCleanupTask(() => {
      stopXhrTracking()
    })
  })

  it('should notify on request start', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        expect(startSpy).toHaveBeenCalledWith({
          requestIndex: jasmine.any(Number) as unknown as number,
          url: jasmine.stringMatching(/\/ok$/) as unknown as string,
        })
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
        expect(request.handlingStack).toBeDefined()
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
        xhr.open('GET', SPEC_ENDPOINTS.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))
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
