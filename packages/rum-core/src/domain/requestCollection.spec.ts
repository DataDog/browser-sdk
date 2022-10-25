import type { RelativeTime, Duration } from '@datadog/browser-core'
import { isIE, RequestType } from '@datadog/browser-core'
import type { FetchStub, FetchStubManager } from '../../../core/test/specHelper'
import { SPEC_ENDPOINTS, stubFetch, stubXhr, withXhr } from '../../../core/test/specHelper'
import { createResourceEntry } from '../../test/fixtures'
import { stubPerformanceObserver } from '../../test/specHelper'
import type { RumConfiguration } from './configuration'
import { validateAndBuildRumConfiguration } from './configuration'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import { trackFetch, trackXhr } from './requestCollection'
import type { Tracer } from './tracing/tracer'
import { clearTracingIfNeeded, TraceIdentifier } from './tracing/tracer'

describe('collect fetch', () => {
  let configuration: RumConfiguration
  const FAKE_URL = 'http://fake-url/'
  let fetchStub: FetchStub
  let fetchStubManager: FetchStubManager
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>
  let stopFetchTracking: () => void

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    configuration = {
      ...validateAndBuildRumConfiguration({ clientToken: 'xxx', applicationId: 'xxx' })!,
      ...SPEC_ENDPOINTS,
      batchMessagesLimit: 1,
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
    ;({ stop: stopFetchTracking } = trackFetch(lifeCycle, configuration, tracerStub as Tracer))

    fetchStub = window.fetch as FetchStub
    window.onunhandledrejection = (ev: PromiseRejectionEvent) => {
      throw new Error(`unhandled rejected promise \n    ${ev.reason as string}`)
    }
  })

  afterEach(() => {
    stopFetchTracking()
    fetchStubManager.reset()
    window.onunhandledrejection = null
  })

  it('should notify on request start', async (done) => {
    await fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      expect(startSpy).toHaveBeenCalledWith({ requestIndex: jasmine.any(Number) as unknown as number, url: FAKE_URL })
      done()
    })
  })

  it('should notify on request complete', async (done) => {
    await fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(500)
      done()
    })
  })

  it('should assign a request id', async (done) => {
    await fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      const startRequestIndex = startSpy.calls.argsFor(0)[0].requestIndex
      const completeRequestIndex = completeSpy.calls.argsFor(0)[0].requestIndex

      expect(completeRequestIndex).toBe(startRequestIndex)
      done()
    })
  })

  it('should ignore intake requests', async (done) => {
    await fetchStub(SPEC_ENDPOINTS.rumEndpointBuilder.build()).resolveWith({ status: 200, responseText: 'foo' })

    fetchStubManager.whenAllComplete(() => {
      expect(startSpy).not.toHaveBeenCalled()
      expect(completeSpy).not.toHaveBeenCalled()
      done()
    })
  })

  describe('tracing', () => {
    it('should trace requests by default', (done) => {
      const entry = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })
      let clear: (() => void) | null = null
      fetchStub(FAKE_URL)
        .resolveWith({ status: 200, responseText: 'ok' })
        .then(() => {
          const request = completeSpy.calls.argsFor(0)[0]

          expect(request.traceId).toBeDefined()
          clear && clear()
          done()
        })
        .catch(done.fail)

      const cb = stubPerformanceObserver([entry])
      clear = cb.clear
    })

    it('should trace aborted requests', (done) => {
      fetchStub(FAKE_URL).abort()

      fetchStubManager.whenAllComplete(() => {
        const request = completeSpy.calls.argsFor(0)[0]

        expect(request.traceId).toBeDefined()
        done()
      })
    })

    it('should not trace requests ending with status 0', async (done) => {
      await fetchStub(FAKE_URL).resolveWith({ status: 0, responseText: 'fetch cancelled' })

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
  let configuration: RumConfiguration
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>
  let stubXhrManager: { reset(): void }
  let stopXhrTracking: () => void

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    configuration = {
      ...validateAndBuildRumConfiguration({ clientToken: 'xxx', applicationId: 'xxx' })!,
      ...SPEC_ENDPOINTS,
      batchMessagesLimit: 1,
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
    ;({ stop: stopXhrTracking } = trackXhr(lifeCycle, configuration, tracerStub as Tracer))
  })

  afterEach(() => {
    stopXhrTracking()
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
        xhr.open('GET', SPEC_ENDPOINTS.rumEndpointBuilder.build())
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
