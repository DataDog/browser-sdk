import { Pipeline } from '@datadog/core-next'
import type { NetworkRequestResource } from '@datadog/core-next'
import { startFetchCollection } from './fetchCollector'
import type { CollectorTracingConfig } from './fetchCollector'

describe('startFetchCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let collected: NetworkRequestResource[]
  let stop: () => void
  let realFetch: typeof window.fetch

  beforeEach(() => {
    realFetch = window.fetch
    pipeline = new Pipeline<Record<string, unknown>>()
    collected = []
    pipeline.subscribe('resource:network_request', (event) => {
      collected.push(event as NetworkRequestResource)
    })
    pipeline.seal()
  })

  afterEach(() => {
    stop()
    // Ensure real fetch is always restored
    window.fetch = realFetch
  })

  it('publishes resource:network_request when fetch resolves', (done) => {
    // Install stub before collector so collector wraps around stub
    window.fetch = () => Promise.resolve(new Response(null, { status: 200 }))
    stop = startFetchCollection(pipeline)

    window.fetch('/test-url').then(() => {
      setTimeout(() => {
        expect(collected.length).toBe(1)
        done()
      }, 0)
    })
  })

  it('includes method, url, status in the resource', (done) => {
    window.fetch = () => Promise.resolve(new Response(null, { status: 200 }))
    stop = startFetchCollection(pipeline)

    window.fetch('/test-url', { method: 'POST' }).then(() => {
      setTimeout(() => {
        expect(collected[0].method).toBe('POST')
        expect(collected[0].url).toBe('/test-url')
        expect(collected[0].status).toBe(200)
        done()
      }, 0)
    })
  })

  it('includes startTime, startDate, and duration', (done) => {
    window.fetch = () => Promise.resolve(new Response(null, { status: 200 }))
    const beforeStart = performance.now()
    const beforeDate = Date.now()
    stop = startFetchCollection(pipeline)

    window.fetch('/test-url').then(() => {
      setTimeout(() => {
        expect(collected[0].startTime).toBeGreaterThanOrEqual(beforeStart)
        expect(collected[0].startDate).toBeGreaterThanOrEqual(beforeDate)
        expect(collected[0].duration).toBeGreaterThanOrEqual(0)
        done()
      }, 0)
    })
  })

  it('publishes with status: 0 when fetch rejects', (done) => {
    window.fetch = () => Promise.reject(new Error('network error'))
    stop = startFetchCollection(pipeline)

    window.fetch('/test-url').catch(() => {
      setTimeout(() => {
        expect(collected.length).toBe(1)
        expect(collected[0].status).toBe(0)
        done()
      }, 0)
    })
  })

  it('reports isAborted: true for AbortError', (done) => {
    const abortError = new DOMException('Aborted', 'AbortError')
    window.fetch = () => Promise.reject(abortError)
    stop = startFetchCollection(pipeline)

    window.fetch('/test-url').catch(() => {
      setTimeout(() => {
        expect(collected[0].isAborted).toBe(true)
        done()
      }, 0)
    })
  })

  it('stop() restores original fetch', () => {
    const stubFetch = () => Promise.resolve(new Response(null, { status: 200 }))
    window.fetch = stubFetch
    stop = startFetchCollection(pipeline)

    expect(window.fetch).not.toBe(stubFetch)

    stop()
    expect(window.fetch).toBe(stubFetch)

    // noop for afterEach
    stop = () => {}
  })

  it('publishes signal:network_request_start when request begins', (done) => {
    let captured: { url: string; method: string } | undefined
    pipeline.subscribe('signal:network_request_start', (event) => {
      captured = event as { url: string; method: string }
    })
    window.fetch = () => Promise.resolve(new Response(null, { status: 200 }))
    stop = startFetchCollection(pipeline)

    window.fetch('/test-url', { method: 'POST' }).then(() => {
      expect(captured).toEqual({ url: '/test-url', method: 'POST' })
      done()
    })
  })

  it('does not publish after stop() is called', (done) => {
    window.fetch = () => Promise.resolve(new Response(null, { status: 200 }))
    stop = startFetchCollection(pipeline)
    stop()

    // Call the patched fetch directly (via captured wrapper) is no longer possible since stop was called
    // After stop, window.fetch is the stub — calls don't go through the collector
    window.fetch('/test-url').then(() => {
      setTimeout(() => {
        expect(collected.length).toBe(0)
        done()
      }, 0)
    })

    // noop for afterEach
    stop = () => {}
  })

  describe('with tracing config', () => {
    const tracingConfig: CollectorTracingConfig = {
      tracingOptions: [{ match: /.*/, propagatorTypes: ['datadog', 'tracecontext'] }],
      traceSampleRate: 100,
      traceContextInjection: 'sampled',
      sessionId: 'test-session-123',
    }

    it('injects tracing headers when URL matches', (done) => {
      let capturedInit: RequestInit | undefined
      window.fetch = (_input: any, init?: RequestInit) => {
        capturedInit = init
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      stop = startFetchCollection(pipeline, tracingConfig)

      window.fetch('/api/test').then(() => {
        setTimeout(() => {
          expect(capturedInit).toBeDefined()
          const headers = new Headers(capturedInit!.headers)
          expect(headers.get('x-datadog-trace-id')).toBeTruthy()
          expect(headers.get('x-datadog-parent-id')).toBeTruthy()
          expect(headers.get('traceparent')).toBeTruthy()
          done()
        }, 0)
      })
    })

    it('does not inject headers when URL does not match', (done) => {
      const config: CollectorTracingConfig = {
        ...tracingConfig,
        tracingOptions: [{ match: 'https://other.com', propagatorTypes: ['datadog'] }],
      }
      let capturedInit: RequestInit | undefined
      window.fetch = (_input: any, init?: RequestInit) => {
        capturedInit = init
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      stop = startFetchCollection(pipeline, config)

      window.fetch('/api/test').then(() => {
        setTimeout(() => {
          const headers = capturedInit ? new Headers(capturedInit.headers) : new Headers()
          expect(headers.get('x-datadog-trace-id')).toBeNull()
          expect(headers.get('traceparent')).toBeNull()
          done()
        }, 0)
      })
    })

    it('includes traceId and spanId in published event', (done) => {
      window.fetch = () => Promise.resolve(new Response(null, { status: 200 }))
      stop = startFetchCollection(pipeline, tracingConfig)

      window.fetch('/api/test').then(() => {
        setTimeout(() => {
          expect(collected[0].traceId).toBeDefined()
          expect(collected[0].spanId).toBeDefined()
          done()
        }, 0)
      })
    })

    it('does not inject headers when tracingConfig is undefined', (done) => {
      let capturedInit: RequestInit | undefined
      window.fetch = (_input: any, init?: RequestInit) => {
        capturedInit = init
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      stop = startFetchCollection(pipeline)

      window.fetch('/api/test').then(() => {
        setTimeout(() => {
          const headers = capturedInit ? new Headers(capturedInit.headers) : new Headers()
          expect(headers.get('x-datadog-trace-id')).toBeNull()
          expect(collected[0].traceId).toBeUndefined()
          expect(collected[0].spanId).toBeUndefined()
          done()
        }, 0)
      })
    })
  })
})
