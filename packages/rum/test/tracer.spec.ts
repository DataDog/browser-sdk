import { Configuration, DEFAULT_CONFIGURATION, XhrContext } from '@datadog/browser-core'
import { startTracer, toDecimalString, TraceIdentifier } from '../src/tracer'

describe('tracer', () => {
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
  }
  const SAME_DOMAIN_CONTEXT: Partial<XhrContext> = { url: window.location.origin }
  const FOO_DOMAIN_CONTEXT: Partial<XhrContext> = { url: 'http://foo.com' }

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

    it('should not trace request on disallowed domain', () => {
      const tracer = startTracer(configuration as Configuration)
      const traceId = tracer.traceXhr(FOO_DOMAIN_CONTEXT, (xhrStub as unknown) as XMLHttpRequest)

      expect(traceId).toBeUndefined()
      expect(xhrStub.headers).toEqual({})
    })
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
