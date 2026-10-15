import { createContextManager, RequestType, startBufferingData } from '@datadog/browser-core'
import { createEndpointBuilder, type EndpointPayload } from '@datadog/js-core/transport'
import type { MockFetch, MockFetchManager, MockXhr } from '@datadog/browser-core/test'
import { createSessionManagerMock, registerCleanupTask, mockFetch, mockXhr, withXhr } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import { trackFetch, trackXhr } from './requestCollection'
import type { Tracer } from './tracing/tracer'
import { clearTracingIfNeeded, startTracer } from './tracing/tracer'
import { createSpanIdentifier, createTraceIdentifier } from './tracing/identifier'

const DEFAULT_PAYLOAD = {} as EndpointPayload

describe('collect fetch', () => {
  const FAKE_URL = 'http://fake-url/'
  let fetch: MockFetch
  let mockFetchManager: MockFetchManager
  let startSpy: jasmine.Spy<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: jasmine.Spy<(requestCompleteEvent: RequestCompleteEvent) => void>
  let stopFetchTracking: () => void

  beforeEach(() => {
    mockFetchManager = mockFetch()
    const { observable: bufferedDataObservable, stop: stopBuffering } = startBufferingData()

    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, startSpy)
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)
    const tracerStub: Partial<Tracer> = {
      clearTracingIfNeeded,
      traceFetch: (context) => {
        context.traceId = createTraceIdentifier()
        context.spanId = createSpanIdentifier()
      },
    }
    ;({ stop: stopFetchTracking } = trackFetch(
      lifeCycle,
      mockRumConfiguration(),
      tracerStub as Tracer,
      bufferedDataObservable
    ))

    // eslint-disable-next-line @typescript-eslint/unbound-method
    fetch = window.fetch as MockFetch

    registerCleanupTask(() => {
      stopFetchTracking()
      stopBuffering()
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
    fetch(createEndpointBuilder(mockRumConfiguration(), 'rum').build('fetch', DEFAULT_PAYLOAD)).resolveWith({
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
    mockXhr()
    const { observable: bufferedDataObservable, stop: stopBuffering } = startBufferingData()

    startSpy = jasmine.createSpy('requestStart')
    completeSpy = jasmine.createSpy('requestComplete')
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, startSpy)
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)
    const tracerStub: Partial<Tracer> = {
      clearTracingIfNeeded,
      traceXhr: (context) => {
        context.traceId = createTraceIdentifier()
        context.spanId = createSpanIdentifier()
      },
    }
    ;({ stop: stopXhrTracking } = trackXhr(lifeCycle, tracerStub as Tracer, bufferedDataObservable))

    registerCleanupTask(() => {
      stopXhrTracking()
      stopBuffering()
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
        xhr.open('GET', createEndpointBuilder(mockRumConfiguration(), 'rum').build('fetch', DEFAULT_PAYLOAD))
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

describe('collect XHR-backed fetch polyfill', () => {
  it('should collect one request and inject tracing headers once', async () => {
    mockFetch()
    mockXhr()
    const setRequestHeader = jasmine.createSpy<(name: string, value: string) => void>()
    window.fetch = Object.assign(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          const xhr = Object.assign(new XMLHttpRequest(), { setRequestHeader })
          xhr.open(init?.method || 'GET', input as string)
          new Headers(init?.headers).forEach((value, name) => xhr.setRequestHeader(name, value))
          xhr.addEventListener('load', () => resolve(new Response(xhr.responseText, { status: xhr.status })))
          xhr.send()
          ;(xhr as unknown as MockXhr).complete(200, 'ok')
        }),
      { polyfill: true }
    )
    const configuration = mockRumConfiguration({
      allowedTracingUrls: [{ match: location.origin, propagatorTypes: ['datadog'] }],
      traceSampleRate: 100,
      sessionSampleRate: 100,
      propagateTraceBaggage: false,
    })
    const tracer = startTracer(
      configuration,
      createSessionManagerMock(),
      createContextManager(),
      createContextManager()
    )
    const lifeCycle = new LifeCycle()
    const startSpy = jasmine.createSpy<(event: RequestStartEvent) => void>()
    const completeSpy = jasmine.createSpy<(event: RequestCompleteEvent) => void>()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, startSpy)
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)
    const { observable: bufferedDataObservable, stop: stopBuffering } = startBufferingData()
    const { stop: stopXhrTracking } = trackXhr(lifeCycle, tracer, bufferedDataObservable)
    const { stop: stopFetchTracking } = trackFetch(lifeCycle, configuration, tracer, bufferedDataObservable)
    registerCleanupTask(() => {
      stopXhrTracking()
      stopFetchTracking()
      stopBuffering()
    })
    await Promise.resolve()

    const response = await window.fetch('/polyfilled-request', { method: 'POST' })

    expect(await response.text()).toBe('ok')
    expect({
      startedRequests: startSpy.calls.count(),
      completedRequests: completeSpy.calls.count(),
      tracingHeaders: setRequestHeader.calls.count(),
    }).toEqual({ startedRequests: 1, completedRequests: 1, tracingHeaders: 4 })
    const request = completeSpy.calls.mostRecent().args[0]
    expect(request.type).toBe(RequestType.XHR)
    expect(request.url).toBe(`${location.origin}/polyfilled-request`)
    expect(request.method).toBe('POST')
    expect(request.status).toBe(200)
    expect(setRequestHeader.calls.allArgs()).toEqual(
      jasmine.arrayContaining([
        ['x-datadog-origin', 'rum'],
        ['x-datadog-parent-id', request.spanId!.toString()],
        ['x-datadog-sampling-priority', '1'],
        ['x-datadog-trace-id', request.traceId!.toString()],
      ])
    )
  })
})

describe('GraphQL response text collection', () => {
  const FAKE_GRAPHQL_URL = 'http://fake-url/graphql'

  function setupGraphQlFetchTest(trackResponseErrors: boolean) {
    const mockFetchManager = mockFetch()
    const completeSpy = jasmine.createSpy('requestComplete')
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)

    const configuration = mockRumConfiguration({
      allowedGraphQlUrls: [{ match: /\/graphql$/, trackResponseErrors }],
    })
    const { observable: bufferedDataObservable, stop: stopBuffering } = startBufferingData()
    const tracerStub: Partial<Tracer> = { clearTracingIfNeeded, traceFetch: jasmine.createSpy() }
    const { stop } = trackFetch(lifeCycle, configuration, tracerStub as Tracer, bufferedDataObservable)
    registerCleanupTask(() => {
      stop()
      stopBuffering()
    })

    // eslint-disable-next-line @typescript-eslint/unbound-method
    return { mockFetchManager, completeSpy, fetch: window.fetch as MockFetch }
  }

  it('should collect responseBody when trackResponseErrors is enabled', (done) => {
    const { mockFetchManager, completeSpy, fetch } = setupGraphQlFetchTest(true)

    const responseBody = JSON.stringify({
      data: null,
      errors: [{ message: 'Not found' }, { message: 'Unauthorized' }],
    })

    fetch(FAKE_GRAPHQL_URL, {
      method: 'POST',
      body: JSON.stringify({ query: 'query Test { test }' }),
    }).resolveWith({
      status: 200,
      responseText: responseBody,
    })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]
      expect(request.responseBody).toBe(responseBody)
      done()
    })
  })

  it('should not collect responseBody when trackResponseErrors is disabled', (done) => {
    const { mockFetchManager, completeSpy, fetch } = setupGraphQlFetchTest(false)

    const responseBody = JSON.stringify({
      data: null,
      errors: [{ message: 'Not found' }],
    })

    fetch(FAKE_GRAPHQL_URL, {
      method: 'POST',
      body: JSON.stringify({ query: 'query Test { test }' }),
    }).resolveWith({
      status: 200,
      responseText: responseBody,
    })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.calls.argsFor(0)[0]
      expect(request.responseBody).toBeUndefined()
      done()
    })
  })
})
