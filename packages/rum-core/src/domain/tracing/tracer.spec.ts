import { isIE, objectEntries } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../test/specHelper'
import { createRumSessionManagerMock, RumSessionManagerMock } from '../../../test/mockRumSessionManager'
import { RumFetchCompleteContext, RumFetchStartContext, RumXhrStartContext } from '../requestCollection'
import { validateAndBuildRumConfiguration } from '../configuration'
import { startTracer, TraceIdentifier } from './tracer'

describe('tracer', () => {
  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'xxx',
    applicationId: 'xxx',
    allowedTracingOrigins: [window.location.origin],
    service: 'service',
  })!
  const ALLOWED_DOMAIN_CONTEXT: Partial<RumXhrStartContext | RumFetchStartContext> = {
    url: window.location.origin,
  }
  const DISALLOWED_DOMAIN_CONTEXT: Partial<RumXhrStartContext | RumFetchStartContext> = {
    url: 'http://foo.com',
  }
  let setupBuilder: TestSetupBuilder
  let sessionManager: RumSessionManagerMock

  beforeEach(() => {
    setupBuilder = setup()
    sessionManager = createRumSessionManagerMock()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('traceXhr', () => {
    interface XhrStub {
      headers: { [name: string]: string }
      setRequestHeader(name: string, value: string): void
    }
    let xhrStub: XhrStub

    beforeEach(() => {
      xhrStub = {
        setRequestHeader(this: XhrStub, name: string, value: string) {
          this.headers[name] = value
        },
        headers: {} as XhrStub['headers'],
      }
    })

    it('should add traceId and spanId to context and add tracing headers', () => {
      const tracer = startTracer(configuration, sessionManager)
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, (xhrStub as unknown) as XMLHttpRequest)

      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(xhrStub.headers).toEqual(tracingHeadersFor(context.traceId!, context.spanId!))
    })

    it('should not trace request on disallowed domain', () => {
      const tracer = startTracer(configuration, sessionManager)
      const context = { ...DISALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, (xhrStub as unknown) as XMLHttpRequest)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
      expect(xhrStub.headers).toEqual({})
    })

    it('should not trace request during untracked session', () => {
      const tracer = startTracer(configuration, sessionManager.setNotTracked())
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, (xhrStub as unknown) as XMLHttpRequest)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
      expect(xhrStub.headers).toEqual({})
    })

    it('should trace requests on configured origins', () => {
      const configurationWithTracingUrls = {
        ...configuration,
        allowedTracingOrigins: [/^https?:\/\/qux\.com/, 'http://bar.com'],
      }
      const stub = (xhrStub as unknown) as XMLHttpRequest

      const tracer = startTracer(configurationWithTracingUrls, sessionManager)

      let context: Partial<RumXhrStartContext> = { url: 'http://qux.com' }
      tracer.traceXhr(context, stub)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      context = { url: 'http://bar.com' }
      tracer.traceXhr(context, stub)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
    })
  })

  describe('traceFetch', () => {
    beforeEach(() => {
      if (isIE()) {
        pending('no fetch support')
      }
    })

    it('should add traceId and spanId to context, and add tracing headers', () => {
      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(context.init!.headers).toEqual(tracingHeadersAsArrayFor(context.traceId!, context.spanId!))
    })

    it('should preserve original request init', () => {
      const init = { method: 'POST' }
      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init,
      }

      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.init).not.toBe(init)
      expect(context.init!.method).toBe('POST')
      expect(context.init!.headers).toEqual(tracingHeadersAsArrayFor(context.traceId!, context.spanId!))
    })

    it('should preserve original headers object', () => {
      const headers = new Headers()
      headers.set('foo', 'bar')

      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init: { headers, method: 'POST' },
      }

      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.init!.headers).not.toBe(headers)
      expect(context.init!.headers).toEqual([
        ['foo', 'bar'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!),
      ])
      expect(toPlainObject(headers)).toEqual({
        foo: 'bar',
      })
    })

    it('should preserve original headers plain object', () => {
      const headers = { foo: 'bar' }

      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init: { headers, method: 'POST' },
      }

      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.init!.headers).not.toBe(headers)
      expect(context.init!.headers).toEqual([
        ['foo', 'bar'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!),
      ])

      expect(headers).toEqual({
        foo: 'bar',
      })
    })

    it('should preserve original headers array', () => {
      const headers = [
        ['foo', 'bar'],
        ['foo', 'baz'],
      ]

      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init: { headers, method: 'POST' },
      }

      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.init!.headers).not.toBe(headers)
      expect(context.init!.headers).toEqual([
        ['foo', 'bar'],
        ['foo', 'baz'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!),
      ])

      expect(headers).toEqual([
        ['foo', 'bar'],
        ['foo', 'baz'],
      ])
    })

    it('should preserve original headers contained in a Request instance', () => {
      const request = new Request(document.location.origin, {
        headers: {
          foo: 'bar',
        },
      })

      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        input: request,
      }

      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.init).toBe(undefined)
      expect(context.input).not.toBe(request)
      expect(headersAsArray((context.input as Request).headers)).toEqual([
        ['foo', 'bar'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!),
      ])
      expect(headersAsArray(request.headers)).toEqual([['foo', 'bar']])
    })

    it('should ignore headers from a Request instance if other headers are set', () => {
      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init: { headers: { 'x-init-header': 'baz' } },
        input: new Request(document.location.origin, {
          headers: { 'x-request-header': 'bar' },
        }),
      }

      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.init!.headers).toEqual([
        ['x-init-header', 'baz'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!),
      ])
    })

    it('should not trace request on disallowed domain', () => {
      const context: Partial<RumFetchStartContext> = { ...DISALLOWED_DOMAIN_CONTEXT }

      const tracer = startTracer(configuration, sessionManager)
      tracer.traceFetch(context)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
      expect(context.init).toBeUndefined()
    })

    it('should trace requests on configured urls', () => {
      const configurationWithTracingUrls = {
        ...configuration,
        allowedTracingOrigins: [/^https?:\/\/qux\.com.*/, 'http://bar.com'],
      }
      const quxDomainContext: Partial<RumFetchStartContext> = { url: 'http://qux.com' }
      const barDomainContext: Partial<RumFetchStartContext> = { url: 'http://bar.com' }

      const tracer = startTracer(configurationWithTracingUrls, sessionManager)

      tracer.traceFetch(quxDomainContext)
      tracer.traceFetch(barDomainContext)
      expect(quxDomainContext.traceId).toBeDefined()
      expect(quxDomainContext.spanId).toBeDefined()
      expect(barDomainContext.traceId).toBeDefined()
      expect(barDomainContext.spanId).toBeDefined()
    })
  })

  describe('clearTracingIfCancelled', () => {
    it('should clear tracing if status is 0', () => {
      const tracer = startTracer(configuration, sessionManager)
      const context: RumFetchCompleteContext = {
        status: 0,

        spanId: new TraceIdentifier(),
        traceId: new TraceIdentifier(),
      } as any
      tracer.clearTracingIfNeeded(context)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
    })

    it('should not clear tracing if status is not 0', () => {
      const tracer = startTracer(configuration, sessionManager)
      const context: RumFetchCompleteContext = {
        status: 200,

        spanId: new TraceIdentifier(),
        traceId: new TraceIdentifier(),
      } as any
      tracer.clearTracingIfNeeded(context)

      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
    })
  })
})

describe('TraceIdentifier', () => {
  it('should generate id', () => {
    const traceIdentifier = new TraceIdentifier()

    expect(traceIdentifier.toDecimalString()).toMatch(/^\d+$/)
  })
})

function toPlainObject(headers: Headers) {
  const result: { [key: string]: string } = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function tracingHeadersFor(traceId: TraceIdentifier, spanId: TraceIdentifier) {
  return {
    'x-datadog-origin': 'rum',
    'x-datadog-parent-id': spanId.toDecimalString(),
    'x-datadog-sampled': '1',
    'x-datadog-sampling-priority': '1',
    'x-datadog-trace-id': traceId.toDecimalString(),
  }
}

function tracingHeadersAsArrayFor(traceId: TraceIdentifier, spanId: TraceIdentifier) {
  return objectEntries(tracingHeadersFor(traceId, spanId)) as Array<[string, string]>
}

function headersAsArray(headers: Headers) {
  const result: Array<[string, string]> = []
  headers.forEach((value, key) => {
    result.push([key, value])
  })
  return result
}
