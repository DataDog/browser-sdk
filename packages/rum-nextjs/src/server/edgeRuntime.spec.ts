import { isEdgeRuntime, createEdgeTracer } from './edgeRuntime'

describe('edgeRuntime', () => {
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = {
      NEXT_RUNTIME: process.env.NEXT_RUNTIME,
      DD_API_KEY: process.env.DD_API_KEY,
      DD_SITE: process.env.DD_SITE,
      DD_SERVICE: process.env.DD_SERVICE,
      DD_ENV: process.env.DD_ENV,
      DD_VERSION: process.env.DD_VERSION,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    }

    // Clear all relevant env vars by default
    delete process.env.NEXT_RUNTIME
    delete process.env.DD_API_KEY
    delete process.env.DD_SITE
    delete process.env.DD_SERVICE
    delete process.env.DD_ENV
    delete process.env.DD_VERSION
    delete process.env.VERCEL_ENV
    delete process.env.VERCEL_GIT_COMMIT_SHA
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  describe('isEdgeRuntime', () => {
    it('should return true when NEXT_RUNTIME is edge', () => {
      process.env.NEXT_RUNTIME = 'edge'
      expect(isEdgeRuntime()).toBe(true)
    })

    it('should return false when NEXT_RUNTIME is not set', () => {
      delete process.env.NEXT_RUNTIME
      expect(isEdgeRuntime()).toBe(false)
    })

    it('should return false when NEXT_RUNTIME is nodejs', () => {
      process.env.NEXT_RUNTIME = 'nodejs'
      expect(isEdgeRuntime()).toBe(false)
    })
  })

  describe('createEdgeTracer', () => {
    describe('startSpan', () => {
      it('should return a span with setTag, finish, and context methods', () => {
        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')

        expect(typeof span.setTag).toBe('function')
        expect(typeof span.finish).toBe('function')
        expect(typeof span.context).toBe('function')
      })

      it('should return context with hex IDs of correct length', () => {
        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')
        const ctx = span.context()

        const traceId = ctx.toTraceId()
        const spanId = ctx.toSpanId()

        // traceId is 128-bit = 32 hex chars
        expect(traceId.length).toBe(32)
        expect(traceId).toMatch(/^[0-9a-f]{32}$/)

        // spanId is 64-bit = 16 hex chars
        expect(spanId.length).toBe(16)
        expect(spanId).toMatch(/^[0-9a-f]{16}$/)
      })

      it('should store tags via setTag', () => {
        process.env.DD_API_KEY = 'test-key'
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')

        span.setTag('http.method', 'GET')
        span.setTag('http.status_code', 200)
        span.finish()

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        const fetchOptions = fetchSpy.calls.mostRecent().args[1] as RequestInit
        const body = JSON.parse(fetchOptions.body as string)
        expect(body.data[0].meta['http.method']).toBe('GET')
        expect(body.data[0].metrics['http.status_code']).toBe(200)
      })
    })

    describe('finish', () => {
      it('should call fetch when API key is available', () => {
        process.env.DD_API_KEY = 'test-api-key'
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')
        span.finish()

        expect(fetchSpy).toHaveBeenCalledTimes(1)
      })

      it('should not call fetch when no API key is present', () => {
        delete process.env.DD_API_KEY
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')
        span.finish()

        expect(fetchSpy).not.toHaveBeenCalled()
      })

      it('should call fetch with correct URL format including site', () => {
        process.env.DD_API_KEY = 'test-key'
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer({ site: 'datadoghq.eu' })
        const span = tracer.startSpan('test.operation')
        span.finish()

        const url = fetchSpy.calls.mostRecent().args[0]
        expect(url).toBe('https://trace.browser-intake-datadoghq.eu/api/v2/spans')
      })

      it('should use default site datadoghq.com when not specified', () => {
        process.env.DD_API_KEY = 'test-key'
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')
        span.finish()

        const url = fetchSpy.calls.mostRecent().args[0]
        expect(url).toBe('https://trace.browser-intake-datadoghq.com/api/v2/spans')
      })

      it('should send the API key in the DD-API-KEY header', () => {
        process.env.DD_API_KEY = 'my-secret-key'
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')
        span.finish()

        const fetchOptions = fetchSpy.calls.mostRecent().args[1] as RequestInit
        const headers = fetchOptions.headers as Record<string, string>
        expect(headers['DD-API-KEY']).toBe('my-secret-key')
      })

      it('should silently catch fetch failures', async () => {
        process.env.DD_API_KEY = 'test-key'
        const fetchError = new Error('network failure')
        spyOn(globalThis, 'fetch').and.returnValue(Promise.reject(fetchError))

        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')

        // finish() fires fetch and forgets — should not throw
        expect(() => span.finish()).not.toThrow()

        // Allow the rejected promise's .catch() to settle
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      it('should set error flag when error tag is present', () => {
        process.env.DD_API_KEY = 'test-key'
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer()
        const span = tracer.startSpan('test.operation')
        span.setTag('error', new Error('something broke'))
        span.finish()

        const body = JSON.parse((fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string)
        expect(body.data[0].error).toBe(1)
      })

      it('should include env and version in meta when set', () => {
        process.env.DD_API_KEY = 'test-key'
        const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response()))

        const tracer = createEdgeTracer({ env: 'production', version: '1.2.3' })
        const span = tracer.startSpan('test.operation')
        span.finish()

        const body = JSON.parse((fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string)
        expect(body.data[0].meta.env).toBe('production')
        expect(body.data[0].meta.version).toBe('1.2.3')
      })
    })
  })
})
