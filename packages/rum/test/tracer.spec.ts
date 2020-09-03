import { Configuration, DEFAULT_CONFIGURATION, FetchContext, isIE, XhrContext } from '@datadog/browser-core'
import { startTracer, TraceIdentifier } from '../src/tracer'
import { setup, TestSetupBuilder } from './specHelper'

describe('tracer', () => {
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    allowedTracingOrigins: [window.location.origin],
  }
  const ALLOWED_DOMAIN_CONTEXT: Partial<XhrContext | FetchContext> = { url: window.location.origin }
  const DISALLOWED_DOMAIN_CONTEXT: Partial<XhrContext | FetchContext> = { url: 'http://foo.com' }
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
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
        // tslint:disable-next-line: no-object-literal-type-assertion
        headers: {} as XhrStub['headers'],
      }
    })

    it('should return traceId and add tracing headers', () => {
      const tracer = startTracer(configuration as Configuration)
      const tracingResult = tracer.traceXhr(ALLOWED_DOMAIN_CONTEXT, (xhrStub as unknown) as XMLHttpRequest)!

      expect(tracingResult).toBeDefined()
      expect(xhrStub.headers).toEqual(tracingHeadersFor(tracingResult.traceId, tracingResult.spanId))
    })

    it('should not trace request on disallowed domain', () => {
      const tracer = startTracer(configuration as Configuration)
      const tracingResult = tracer.traceXhr(DISALLOWED_DOMAIN_CONTEXT, (xhrStub as unknown) as XMLHttpRequest)

      expect(tracingResult).toBeUndefined()
      expect(xhrStub.headers).toEqual({})
    })

    it('should trace requests on configured origins', () => {
      const configurationWithTracingUrls: Partial<Configuration> = {
        ...configuration,
        allowedTracingOrigins: [/^https?:\/\/qux\.com/, 'http://bar.com'],
      }
      const stub = (xhrStub as unknown) as XMLHttpRequest

      const tracer = startTracer(configurationWithTracingUrls as Configuration)

      expect(tracer.traceXhr({ url: 'http://qux.com' }, stub)).toBeDefined()
      expect(tracer.traceXhr({ url: 'http://bar.com' }, stub)).toBeDefined()
    })
  })

  describe('traceFetch', () => {
    beforeEach(() => {
      if (isIE()) {
        pending('no fetch support')
      }
    })

    it('should return traceId and add tracing headers', () => {
      const context: Partial<FetchContext> = { ...ALLOWED_DOMAIN_CONTEXT }

      const tracer = startTracer(configuration as Configuration)
      const tracingResult = tracer.traceFetch(context)!

      expect(tracingResult).toBeDefined()
      expect(context.init!.headers).toEqual(tracingHeadersFor(tracingResult.traceId, tracingResult.spanId))
    })

    it('should preserve original request init and headers', () => {
      const headers = new Headers()
      headers.set('foo', 'bar')

      const init = { headers, method: 'POST' }
      const context: Partial<FetchContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init,
      }

      const tracer = startTracer(configuration as Configuration)
      const tracingResult = tracer.traceFetch(context)!

      expect(context.init).not.toBe(init)
      expect(context.init!.method).toBe('POST')

      expect(context.init!.headers).not.toBe(headers)
      expect(context.init!.headers).toEqual({
        ...tracingHeadersFor(tracingResult.traceId, tracingResult.spanId),
        foo: 'bar',
      })

      const originalHeadersPlainObject: { [key: string]: string } = {}
      headers.forEach((value, key) => {
        originalHeadersPlainObject[key] = value
      })
      expect(originalHeadersPlainObject).toEqual({
        foo: 'bar',
      })
    })

    it('should not trace request on disallowed domain', () => {
      const context: Partial<FetchContext> = { ...DISALLOWED_DOMAIN_CONTEXT }

      const tracer = startTracer(configuration as Configuration)
      const tracingResult = tracer.traceFetch(context)

      expect(tracingResult).toBeUndefined()
      expect(context.init).toBeUndefined()
    })

    it('should trace requests on configured urls', () => {
      const configurationWithTracingUrls: Partial<Configuration> = {
        ...configuration,
        allowedTracingOrigins: [/^https?:\/\/qux\.com.*/, 'http://bar.com'],
      }
      const quxDomainContext: Partial<FetchContext> = { url: 'http://qux.com' }
      const barDomainContext: Partial<FetchContext> = { url: 'http://bar.com' }

      const tracer = startTracer(configurationWithTracingUrls as Configuration)

      expect(tracer.traceFetch(quxDomainContext)).toBeDefined()
      expect(tracer.traceFetch(barDomainContext)).toBeDefined()
    })
  })
})

describe('TraceIdentifier', () => {
  it('should generate id', () => {
    const traceIdentifier = new TraceIdentifier()

    expect(traceIdentifier.toDecimalString()).toMatch(/^\d+$/)
  })
})

function tracingHeadersFor(traceId: TraceIdentifier, spanId: TraceIdentifier) {
  return {
    'x-datadog-origin': 'rum',
    'x-datadog-parent-id': spanId.toDecimalString(),
    'x-datadog-sampled': '1',
    'x-datadog-sampling-priority': '1',
    'x-datadog-trace-id': traceId.toDecimalString(),
  }
}
