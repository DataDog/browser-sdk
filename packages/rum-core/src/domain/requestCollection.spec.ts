import { vi, beforeEach, describe, expect, it, test, type Mock } from 'vitest'
import type { Payload } from '@datadog/browser-core'
import { RequestType } from '@datadog/browser-core'
import type { MockFetch, MockFetchManager } from '@datadog/browser-core/test'
import { registerCleanupTask, SPEC_ENDPOINTS, mockFetch, mockXhr, withXhr } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import { trackFetch, trackXhr } from './requestCollection'
import type { Tracer } from './tracing/tracer'
import { clearTracingIfNeeded } from './tracing/tracer'
import { createSpanIdentifier, createTraceIdentifier } from './tracing/identifier'

const DEFAULT_PAYLOAD = {} as Payload

describe('collect fetch', () => {
  const FAKE_URL = 'http://fake-url/'
  let fetch: MockFetch
  let mockFetchManager: MockFetchManager
  let startSpy: Mock<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: Mock<(requestCompleteEvent: RequestCompleteEvent) => void>
  let stopFetchTracking: () => void

  beforeEach(() => {
    mockFetchManager = mockFetch()

    startSpy = vi.fn()
    completeSpy = vi.fn()
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
    ;({ stop: stopFetchTracking } = trackFetch(lifeCycle, mockRumConfiguration(), tracerStub as Tracer))

    fetch = window.fetch as MockFetch

    registerCleanupTask(() => {
      stopFetchTracking()
    })
  })

  it('should notify on request start', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      expect(startSpy).toHaveBeenCalledWith({ requestIndex: expect.any(Number) as unknown as number, url: FAKE_URL })
      resolve()
    })
  }))

  it('should notify on request without body', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 200 })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.mock.calls[0][0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should notify on request with body used by another instrumentation', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 200, bodyUsed: true })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.mock.calls[0][0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should notify on request with body disturbed', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 200, bodyDisturbed: true })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.mock.calls[0][0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should notify on request complete', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      const request = completeSpy.mock.calls[0][0]

      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(500)
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should assign a request id', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      const startRequestIndex = startSpy.mock.calls[0][0].requestIndex
      const completeRequestIndex = completeSpy.mock.calls[0][0].requestIndex

      expect(completeRequestIndex).toBe(startRequestIndex)
      resolve()
    })
  }))

  it('should ignore intake requests', () => new Promise<void>((resolve) => {
    fetch(SPEC_ENDPOINTS.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).resolveWith({
      status: 200,
      responseText: 'foo',
    })

    mockFetchManager.whenAllComplete(() => {
      expect(startSpy).not.toHaveBeenCalled()
      expect(completeSpy).not.toHaveBeenCalled()
      resolve()
    })
  }))

  describe('tracing', () => {
    it('should trace requests by default', () => new Promise<void>((resolve) => {
      fetch(FAKE_URL).resolveWith({ status: 200, responseText: 'ok' })

      mockFetchManager.whenAllComplete(() => {
        const request = completeSpy.mock.calls[0][0]

        expect(request.traceId).toBeDefined()
        resolve()
      })
    }))

    it('should trace aborted requests', () => new Promise<void>((resolve) => {
      fetch(FAKE_URL).abort()

      mockFetchManager.whenAllComplete(() => {
        const request = completeSpy.mock.calls[0][0]

        expect(request.traceId).toBeDefined()
        resolve()
      })
    }))

    it('should not trace requests ending with status 0', () => new Promise<void>((resolve) => {
      fetch(FAKE_URL).resolveWith({ status: 0, responseText: 'fetch cancelled' })

      mockFetchManager.whenAllComplete(() => {
        const request = completeSpy.mock.calls[0][0]

        expect(request.status).toEqual(0)
        expect(request.traceId).toBeUndefined()
        resolve()
      })
    }))
  })
})

describe('collect xhr', () => {
  let startSpy: Mock<(requestStartEvent: RequestStartEvent) => void>
  let completeSpy: Mock<(requestCompleteEvent: RequestCompleteEvent) => void>
  let stopXhrTracking: () => void

  beforeEach(() => {
    const configuration = mockRumConfiguration()
    mockXhr()
    startSpy = vi.fn()
    completeSpy = vi.fn()
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
    ;({ stop: stopXhrTracking } = trackXhr(lifeCycle, configuration, tracerStub as Tracer))

    registerCleanupTask(() => {
      stopXhrTracking()
    })
  })

  it('should notify on request start', () => new Promise<void>((resolve) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        expect(startSpy).toHaveBeenCalledWith({
          requestIndex: expect.any(Number) as unknown as number,
          url: expect.stringMatching(/\/ok$/) as unknown as string,
        })
        resolve()
      },
    })
  }))

  it('should notify on request complete', () => new Promise<void>((resolve) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200, 'ok')
      },
      onComplete() {
        const request = completeSpy.mock.calls[0][0]

        expect(request.type).toEqual(RequestType.XHR)
        expect(request.method).toEqual('GET')
        expect(request.url).toContain('/ok')
        expect(request.status).toEqual(200)
        expect(request.handlingStack).toBeDefined()
        resolve()
      },
    })
  }))

  it('should assign a request id', () => new Promise<void>((resolve) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        const startRequestIndex = startSpy.mock.calls[0][0].requestIndex
        const completeRequestIndex = completeSpy.mock.calls[0][0].requestIndex

        expect(completeRequestIndex).toBe(startRequestIndex)
        resolve()
      },
    })
  }))

  it('should ignore intake requests', () => new Promise<void>((resolve) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', SPEC_ENDPOINTS.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD))
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        expect(startSpy).not.toHaveBeenCalled()
        expect(completeSpy).not.toHaveBeenCalled()
        resolve()
      },
    })
  }))

  it('should not trace cancelled requests', () => new Promise<void>((resolve) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(0)
      },
      onComplete() {
        const request = completeSpy.mock.calls[0][0]
        expect(request.status).toEqual(0)
        expect(request.traceId).toEqual(undefined)
        resolve()
      },
    })
  }))

  describe('tracing', () => {
    it('should trace requests by default', () => new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(200)
        },
        onComplete() {
          const request = completeSpy.mock.calls[0][0]
          expect(request.traceId).toBeDefined()
          resolve()
        },
      })
    }))

    it('should trace aborted requests', () => new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.abort()
        },
        onComplete() {
          const request = completeSpy.mock.calls[0][0]
          expect(request.traceId).toBeDefined()
          resolve()
        },
      })
    }))

    it('should not trace requests ending with status 0', () => new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(0)
        },
        onComplete() {
          const request = completeSpy.mock.calls[0][0]
          expect(request.status).toEqual(0)
          expect(request.traceId).toBeUndefined()
          resolve()
        },
      })
    }))
  })
})

describe('GraphQL response text collection', () => {
  const FAKE_GRAPHQL_URL = 'http://fake-url/graphql'

  function setupGraphQlFetchTest(trackResponseErrors: boolean) {
    const mockFetchManager = mockFetch()
    const completeSpy = vi.fn()
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, completeSpy)

    const configuration = mockRumConfiguration({
      allowedGraphQlUrls: [{ match: /\/graphql$/, trackResponseErrors }],
    })
    const tracerStub: Partial<Tracer> = { clearTracingIfNeeded, traceFetch: vi.fn() }
    const { stop } = trackFetch(lifeCycle, configuration, tracerStub as Tracer)
    registerCleanupTask(() => {
      stop()
    })

    return { mockFetchManager, completeSpy, fetch: window.fetch as MockFetch }
  }

  it('should collect responseBody when trackResponseErrors is enabled', () => new Promise<void>((resolve) => {
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
      const request = completeSpy.mock.calls[0][0]
      expect(request.responseBody).toBe(responseBody)
      resolve()
    })
  }))

  it('should not collect responseBody when trackResponseErrors is disabled', () => new Promise<void>((resolve) => {
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
      const request = completeSpy.mock.calls[0][0]
      expect(request.responseBody).toBeUndefined()
      resolve()
    })
  }))
})
