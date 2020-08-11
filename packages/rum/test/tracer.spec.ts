import { Configuration, DEFAULT_CONFIGURATION, FetchContext, isIE, XhrContext } from '@datadog/browser-core'
import { startTracer, toDecimalString, toHexString, TraceIdentifier } from '../src/tracer'
import { setup, TestSetupBuilder } from './specHelper'

describe('tracer', () => {
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    enableTracing: true,
  }
  const SAME_DOMAIN_CONTEXT: Partial<XhrContext | FetchContext> = { url: window.location.origin }
  const FOO_DOMAIN_CONTEXT: Partial<XhrContext | FetchContext> = { url: 'http://foo.com' }
  const BAR_DOMAIN_CONTEXT: Partial<XhrContext | FetchContext> = { url: 'http://bar.com' }
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
      const traceId = tracer.traceXhr(SAME_DOMAIN_CONTEXT, (xhrStub as unknown) as XMLHttpRequest)

      expect(traceId).toBeDefined()
      expect(xhrStub.headers).toEqual(tracingHeadersFor(traceId!))
    })

    it('should not trace when tracing is disabled', () => {
      const disabledConfiguration = { ...configuration, enableTracing: false }

      const tracer = startTracer(disabledConfiguration as Configuration)
      const traceId = tracer.traceXhr(SAME_DOMAIN_CONTEXT, (xhrStub as unknown) as XMLHttpRequest)

      expect(traceId).toBeUndefined()
      expect(xhrStub.headers).toEqual({})
    })

    it('should not trace request on disallowed domain', () => {
      const tracer = startTracer(configuration as Configuration)
      const traceId = tracer.traceXhr(FOO_DOMAIN_CONTEXT, (xhrStub as unknown) as XMLHttpRequest)

      expect(traceId).toBeUndefined()
      expect(xhrStub.headers).toEqual({})
    })

    it('should trace requests on configured urls', () => {
      const configurationWithTracingUrls: Partial<Configuration> = {
        ...configuration,
        shouldTraceUrl: (url) => /^https?:\/\/foo\.com.*/.test(url),
      }
      const stub = (xhrStub as unknown) as XMLHttpRequest

      const tracer = startTracer(configurationWithTracingUrls as Configuration)

      expect(tracer.traceXhr(SAME_DOMAIN_CONTEXT, stub)).toBeUndefined()
      expect(tracer.traceXhr(FOO_DOMAIN_CONTEXT, stub)).toBeDefined()
      expect(tracer.traceXhr(BAR_DOMAIN_CONTEXT, stub)).toBeUndefined()
    })
  })

  describe('traceFetch', () => {
    beforeEach(() => {
      if (isIE()) {
        pending('no fetch support')
      }
    })

    it('should return traceId and add tracing headers', () => {
      const context: Partial<FetchContext> = { ...SAME_DOMAIN_CONTEXT }

      const tracer = startTracer(configuration as Configuration)
      const traceId = tracer.traceFetch(context)

      expect(traceId).toBeDefined()
      expect(context.init!.headers).toEqual(tracingHeadersFor(traceId!))
    })

    it('should preserve original request init and headers', () => {
      const headers = new Headers()
      headers.set('foo', 'bar')

      const context: Partial<FetchContext> = {
        ...SAME_DOMAIN_CONTEXT,
        init: { headers, method: 'POST' },
      }

      const tracer = startTracer(configuration as Configuration)
      const traceId = tracer.traceFetch(context)

      expect(context.init!.method).toBe('POST')
      expect(context.init!.headers).toBe(headers)

      const headersPlainObject: { [key: string]: string } = {}
      headers.forEach((value, key) => {
        headersPlainObject[key] = value
      })
      expect(headersPlainObject).toEqual({ ...tracingHeadersFor(traceId!), foo: 'bar' })
    })

    it('should not trace when tracing is disabled', () => {
      const disabledConfiguration = { ...configuration, enableTracing: false }
      const context: Partial<FetchContext> = { ...SAME_DOMAIN_CONTEXT }

      const tracer = startTracer(disabledConfiguration as Configuration)
      const traceId = tracer.traceFetch(context)

      expect(traceId).toBeUndefined()
      expect(context.init).toBeUndefined()
    })

    it('should not trace request on disallowed domain', () => {
      const context: Partial<FetchContext> = { ...FOO_DOMAIN_CONTEXT }

      const tracer = startTracer(configuration as Configuration)
      const traceId = tracer.traceFetch(context)

      expect(traceId).toBeUndefined()
      expect(context.init).toBeUndefined()
    })

    it('should trace requests on configured urls', () => {
      const configurationWithTracingUrls: Partial<Configuration> = {
        ...configuration,
        shouldTraceUrl: (url) => /^https?:\/\/foo\.com.*/.test(url),
      }
      const sameDomainContext: Partial<FetchContext> = { ...SAME_DOMAIN_CONTEXT }
      const fooDomainContext: Partial<FetchContext> = { ...FOO_DOMAIN_CONTEXT }
      const barDomainContext: Partial<FetchContext> = { ...BAR_DOMAIN_CONTEXT }

      const tracer = startTracer(configurationWithTracingUrls as Configuration)

      expect(tracer.traceFetch(sameDomainContext)).toBeUndefined()
      expect(tracer.traceFetch(fooDomainContext)).toBeDefined()
      expect(tracer.traceFetch(barDomainContext)).toBeUndefined()
    })
  })
})

describe('TraceIdentifier', () => {
  it('should generate id', () => {
    const traceIdentifier = new TraceIdentifier()

    expect(toDecimalString(traceIdentifier)).toMatch(/^\d+$/)
    expect(toHexString(traceIdentifier)).toMatch(/^[0-9A-F]+$/i)
  })
})

function tracingHeadersFor(traceId: TraceIdentifier) {
  return {
    'x-datadog-origin': 'rum',
    'x-datadog-parent-id': toDecimalString(traceId),
    'x-datadog-sampled': '1',
    'x-datadog-sampling-priority': '1',
    'x-datadog-trace-id': toDecimalString(traceId),
  }
}
