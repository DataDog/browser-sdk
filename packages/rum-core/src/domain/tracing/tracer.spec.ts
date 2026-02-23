import type { ContextManager, ContextValue } from '@datadog/browser-core'
import { display, objectEntries, TraceContextInjection } from '@datadog/browser-core'
import type { RumSessionManagerMock } from '../../../test'
import { createRumSessionManagerMock } from '../../../test'
import type { RumFetchResolveContext, RumFetchStartContext, RumXhrStartContext } from '../requestCollection'
import type { RumInitConfiguration } from '../configuration'
import { validateAndBuildRumConfiguration } from '../configuration'
import { startTracer } from './tracer'
import type { SpanIdentifier, TraceIdentifier } from './identifier'
import { createSpanIdentifier, createTraceIdentifier } from './identifier'

describe('tracer', () => {
  const ALLOWED_DOMAIN_CONTEXT: Partial<RumXhrStartContext | RumFetchStartContext> = {
    url: window.location.origin,
  }
  const DISALLOWED_DOMAIN_CONTEXT: Partial<RumXhrStartContext | RumFetchStartContext> = {
    url: 'http://foo.com',
  }

  function startTracerWithDefaults({
    initConfiguration,
    sessionManager = createRumSessionManagerMock(),
    userId = '1234',
  }: {
    initConfiguration?: Partial<RumInitConfiguration>
    sessionManager?: RumSessionManagerMock
    userId?: ContextValue
  } = {}) {
    const configuration = validateAndBuildRumConfiguration({
      clientToken: 'xxx',
      applicationId: 'xxx',
      service: 'service',
      allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['datadog'] }],
      ...initConfiguration,
    })!
    const userContext = { getContext: () => ({ id: userId }) } as unknown as ContextManager
    const accountContext = { getContext: () => ({ id: '5678' }) } as unknown as ContextManager
    const tracer = startTracer(configuration, sessionManager, userContext, accountContext)
    return tracer
  }

  describe('traceXhr', () => {
    interface MockXhr {
      headers: { [name: string]: string }
      setRequestHeader(name: string, value: string): void
    }
    let xhr: MockXhr

    beforeEach(() => {
      xhr = {
        setRequestHeader(this: MockXhr, name: string, value: string) {
          this.headers[name] = value
        },
        headers: {} as MockXhr['headers'],
      }
    })

    it('should add traceId and spanId to context and add tracing headers', () => {
      const tracer = startTracerWithDefaults()
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(xhr.headers).toEqual(tracingHeadersFor(context.traceId!, context.spanId!, '1'))
    })

    it('should not trace request on disallowed domain', () => {
      const tracer = startTracerWithDefaults()
      const context = { ...DISALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
      expect(xhr.headers).toEqual({})
    })

    it('should not trace request during untracked session', () => {
      const tracer = startTracerWithDefaults({
        sessionManager: createRumSessionManagerMock().setNotTracked(),
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
      expect(xhr.headers).toEqual({})
    })

    it("should trace request with priority '1' when sampled", () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: { traceSampleRate: 100 },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(context.traceSampled).toBe(true)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(xhr.headers).toEqual(tracingHeadersFor(context.traceId!, context.spanId!, '1'))
    })

    it("should trace request with priority '0' when not sampled and config set to all", () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: { traceSampleRate: 0, traceContextInjection: TraceContextInjection.ALL },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(context.traceSampled).toBe(false)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(xhr.headers).toEqual(tracingHeadersFor(context.traceId!, context.spanId!, '0'))
    })

    it("should trace request with sampled set to '0' in OTel headers when not sampled and config set to all", () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          traceSampleRate: 0,
          traceContextInjection: TraceContextInjection.ALL,
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['b3', 'tracecontext', 'b3multi'] }],
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers).toEqual(
        jasmine.objectContaining({
          b3: jasmine.stringMatching(/^[0-9a-f]{16}-[0-9a-f]{16}-0$/),
          traceparent: jasmine.stringMatching(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-00$/),
          tracestate: 'dd=s:0;o:rum',
          'X-B3-Sampled': '0',
        })
      )
    })

    it('should trace requests on configured origins', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [
            /^https?:\/\/qux\.com/,
            'http://bar.com',
            (origin: string) => origin === 'http://dynamic.com',
          ],
        },
      })
      const stub = xhr as unknown as XMLHttpRequest

      let context: Partial<RumXhrStartContext> = { url: 'http://qux.com' }
      tracer.traceXhr(context, stub)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()

      context = { url: 'http://bar.com' }
      tracer.traceXhr(context, stub)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()

      context = { url: 'http://dynamic.com' }
      tracer.traceXhr(context, stub)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
    })

    it('should add headers only for B3 Multiple propagator', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['b3multi'] }],
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers).toEqual(
        jasmine.objectContaining({
          'X-B3-TraceId': jasmine.stringMatching(/^[0-9a-f]{16}$/),
          'X-B3-SpanId': jasmine.stringMatching(/^[0-9a-f]{16}$/),
          'X-B3-Sampled': '1',
        })
      )

      expect(xhr.headers['x-datadog-origin']).toBeUndefined()
      expect(xhr.headers['x-datadog-parent-id']).toBeUndefined()
      expect(xhr.headers['x-datadog-trace-id']).toBeUndefined()
      expect(xhr.headers['x-datadog-sampling-priority']).toBeUndefined()
    })

    it('should add headers for B3 (single) and tracecontext propagators', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['b3', 'tracecontext'] }],
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers).toEqual(
        jasmine.objectContaining({
          b3: jasmine.stringMatching(/^[0-9a-f]{16}-[0-9a-f]{16}-1$/),
          traceparent: jasmine.stringMatching(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
          tracestate: 'dd=s:1;o:rum',
        })
      )
    })

    it('should not add any headers', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: [] }],
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers['b3']).toBeUndefined()
      expect(xhr.headers['traceparent']).toBeUndefined()
      expect(xhr.headers['tracestate']).toBeUndefined()
      expect(xhr.headers['x-datadog-trace-id']).toBeUndefined()
      expect(xhr.headers['X-B3-TraceId']).toBeUndefined()
    })

    it('should not add any headers when trace not sampled and config set to sampled', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          traceSampleRate: 0,
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers['x-datadog-trace-id']).toBeUndefined()
      expect(xhr.headers['x-datadog-sampling-priority']).toBeUndefined()
    })

    it('should add headers when trace sampled and config set to sampled', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          traceSampleRate: 100,
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers['x-datadog-trace-id']).toBeDefined()
      expect(xhr.headers['x-datadog-sampling-priority']).toBeDefined()
    })

    it('should add headers when trace not sampled and config set to all', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          traceSampleRate: 0,
          traceContextInjection: TraceContextInjection.ALL,
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers['x-datadog-trace-id']).toBeDefined()
      expect(xhr.headers['x-datadog-sampling-priority']).toBeDefined()
    })

    describe('baggage propagation header', () => {
      function traceRequestAndGetBaggageHeader({
        initConfiguration,
        userId,
      }: {
        initConfiguration: Partial<RumInitConfiguration>
        userId?: ContextValue
      }) {
        const tracer = startTracerWithDefaults({
          initConfiguration,
          userId,
        })
        const context = { ...ALLOWED_DOMAIN_CONTEXT }
        tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)
        return xhr.headers.baggage
      }

      it('should add user.id, account.id and session.id to baggage header when feature is enabled and propagateTraceBaggage is true', () => {
        const baggage = traceRequestAndGetBaggageHeader({
          initConfiguration: {
            propagateTraceBaggage: true,
          },
        })
        expect(baggage).toEqual('session.id=session-id,user.id=1234,account.id=5678')
      })

      it('should not add baggage header when propagateTraceBaggage is false', () => {
        const baggage = traceRequestAndGetBaggageHeader({
          initConfiguration: {
            propagateTraceBaggage: false,
          },
        })
        expect(baggage).toBeUndefined()
      })

      it('url-encodes baggage values', () => {
        const baggage = traceRequestAndGetBaggageHeader({
          initConfiguration: {
            propagateTraceBaggage: true,
          },
          userId: '1234, 😀',
        })
        expect(baggage).toBe('session.id=session-id,user.id=1234%2C%20%F0%9F%98%80,account.id=5678')
      })

      it('skips non-string context values', () => {
        const baggage = traceRequestAndGetBaggageHeader({
          initConfiguration: {
            propagateTraceBaggage: true,
          },
          userId: 1234,
        })
        expect(baggage).toBe('session.id=session-id,account.id=5678')
      })
    })

    it('should ignore wrong propagator types', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['foo', 32, () => true] as any }],
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(xhr.headers['b3']).toBeUndefined()
      expect(xhr.headers['traceparent']).toBeUndefined()
      expect(xhr.headers['tracestate']).toBeUndefined()
      expect(xhr.headers['x-datadog-trace-id']).toBeUndefined()
      expect(xhr.headers['X-B3-TraceId']).toBeUndefined()
    })

    it('should display an error when a matching function throws', () => {
      const displaySpy = spyOn(display, 'error')
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [
            () => {
              throw new Error('invalid')
            },
          ],
        },
      })
      const context = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceXhr(context, xhr as unknown as XMLHttpRequest)

      expect(displaySpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('traceFetch', () => {
    it('should add traceId and spanId to context, and add tracing headers', () => {
      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(context.init!.headers).toEqual(tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'))
    })

    it('should preserve original request init', () => {
      const init = { method: 'POST' }
      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init,
      }

      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.init).not.toBe(init)
      expect(context.init!.method).toBe('POST')
      expect(context.init!.headers).toEqual(tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'))
    })

    it('should preserve original headers object', () => {
      const headers = new Headers()
      headers.set('foo', 'bar')

      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init: { headers, method: 'POST' },
      }

      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.init!.headers).not.toBe(headers)
      expect(context.init!.headers).toEqual([
        ['foo', 'bar'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'),
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

      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.init!.headers).not.toBe(headers)
      expect(context.init!.headers).toEqual([
        ['foo', 'bar'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'),
      ])

      expect(headers).toEqual({
        foo: 'bar',
      })
    })

    it('should preserve original headers array', () => {
      const headers: Array<[string, string]> = [
        ['foo', 'bar'],
        ['foo', 'baz'],
      ]

      const context: Partial<RumFetchStartContext> = {
        ...ALLOWED_DOMAIN_CONTEXT,
        init: { headers, method: 'POST' },
      }

      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.init!.headers).not.toBe(headers)
      expect(context.init!.headers).toEqual([
        ['foo', 'bar'],
        ['foo', 'baz'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'),
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

      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.init).toBe(undefined)
      expect(context.input).not.toBe(request)
      expect(headersAsArray((context.input as Request).headers)).toEqual([
        ['foo', 'bar'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'),
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

      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.init!.headers).toEqual([
        ['x-init-header', 'baz'],
        ...tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'),
      ])
    })

    it('should not trace request on disallowed domain', () => {
      const context: Partial<RumFetchStartContext> = { ...DISALLOWED_DOMAIN_CONTEXT }

      const tracer = startTracerWithDefaults()
      tracer.traceFetch(context)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
      expect(context.init).toBeUndefined()
    })

    it('should not trace request during untracked session', () => {
      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }

      const tracer = startTracerWithDefaults({
        sessionManager: createRumSessionManagerMock().setNotTracked(),
      })
      tracer.traceFetch(context)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
      expect(context.init).toBeUndefined()
    })

    it("should trace request with priority '1' when sampled", () => {
      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }

      const tracer = startTracerWithDefaults({ initConfiguration: { traceSampleRate: 100 } })
      tracer.traceFetch(context)

      expect(context.traceSampled).toBe(true)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(context.init!.headers).toEqual(tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '1'))
    })

    it("should trace request with priority '0' when not sampled and config set to all", () => {
      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }

      const tracer = startTracerWithDefaults({
        initConfiguration: { traceSampleRate: 0, traceContextInjection: TraceContextInjection.ALL },
      })
      tracer.traceFetch(context)

      expect(context.traceSampled).toBe(false)
      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
      expect(context.init!.headers).toEqual(tracingHeadersAsArrayFor(context.traceId!, context.spanId!, '0'))
    })

    it('should trace requests on configured urls', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [
            /^https?:\/\/qux\.com.*/,
            'http://bar.com',
            (origin: string) => origin === 'http://dynamic.com',
          ],
        },
      })
      const quxDomainContext: Partial<RumFetchStartContext> = { url: 'http://qux.com' }
      const barDomainContext: Partial<RumFetchStartContext> = { url: 'http://bar.com' }
      const dynamicDomainContext: Partial<RumFetchStartContext> = { url: 'http://dynamic.com' }

      tracer.traceFetch(quxDomainContext)
      tracer.traceFetch(barDomainContext)
      tracer.traceFetch(dynamicDomainContext)
      expect(quxDomainContext.traceId).toBeDefined()
      expect(quxDomainContext.spanId).toBeDefined()
      expect(barDomainContext.traceId).toBeDefined()
      expect(barDomainContext.spanId).toBeDefined()
      expect(dynamicDomainContext.traceId).toBeDefined()
      expect(dynamicDomainContext.spanId).toBeDefined()
    })

    it('should add headers only for B3 Multiple propagator', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['b3multi'] }],
        },
      })

      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceFetch(context)

      expect(context.init!.headers).toContain(jasmine.arrayContaining(['X-B3-TraceId']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['X-B3-SpanId']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['X-B3-Sampled']))

      expect(context.init!.headers).toEqual(
        jasmine.arrayContaining([
          ['X-B3-TraceId', jasmine.stringMatching(/^[0-9a-f]{16}$/)],
          ['X-B3-SpanId', jasmine.stringMatching(/^[0-9a-f]{16}$/)],
          ['X-B3-Sampled', '1'],
        ])
      )

      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['x-datadog-origin']))
      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['x-datadog-parent-id']))
      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['x-datadog-trace-id']))
      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['x-datadog-sampling-priority']))
    })

    it('should add headers for b3 (single) and tracecontext propagators', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['b3', 'tracecontext'] }],
        },
      })

      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceFetch(context)

      expect(context.init!.headers).toEqual(
        jasmine.arrayContaining([
          ['b3', jasmine.stringMatching(/^[0-9a-f]{16}-[0-9a-f]{16}-1$/)],
          ['traceparent', jasmine.stringMatching(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-01$/)],
          ['tracestate', 'dd=s:1;o:rum'],
        ])
      )
    })

    it('should not add any headers with no propagatorTypes', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: [] }],
        },
      })

      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceFetch(context)

      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['b3']))
      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['traceparent']))
      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['tracestate']))
      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['x-datadog-trace-id']))
      expect(context.init!.headers).not.toContain(jasmine.arrayContaining(['X-B3-TraceId']))
    })
    it('should not add headers when trace not sampled and config set to sampled', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          traceSampleRate: 0,
          traceContextInjection: TraceContextInjection.SAMPLED,
        },
      })

      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceFetch(context)

      expect(context.init).toBeUndefined()
    })

    it('should add headers when trace sampled and config set to sampled', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          traceSampleRate: 100,
          traceContextInjection: TraceContextInjection.SAMPLED,
        },
      })

      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceFetch(context)

      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-origin']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-parent-id']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-trace-id']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-sampling-priority']))
    })

    it('should add headers when trace not sampled and config set to all', () => {
      const tracer = startTracerWithDefaults({
        initConfiguration: {
          traceSampleRate: 0,
          traceContextInjection: TraceContextInjection.ALL,
        },
      })

      const context: Partial<RumFetchStartContext> = { ...ALLOWED_DOMAIN_CONTEXT }
      tracer.traceFetch(context)

      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-origin']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-parent-id']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-trace-id']))
      expect(context.init!.headers).toContain(jasmine.arrayContaining(['x-datadog-sampling-priority']))
    })
  })

  describe('clearTracingIfCancelled', () => {
    it('should clear tracing if status is 0', () => {
      const tracer = startTracerWithDefaults()
      const context: RumFetchResolveContext = {
        status: 0,

        spanId: createSpanIdentifier(),
        traceId: createTraceIdentifier(),
      } satisfies Partial<RumFetchResolveContext> as any
      tracer.clearTracingIfNeeded(context)

      expect(context.traceId).toBeUndefined()
      expect(context.spanId).toBeUndefined()
    })

    it('should not clear tracing if status is not 0', () => {
      const tracer = startTracerWithDefaults()
      const context: RumFetchResolveContext = {
        status: 200,

        spanId: createSpanIdentifier(),
        traceId: createTraceIdentifier(),
      } satisfies Partial<RumFetchResolveContext> as any
      tracer.clearTracingIfNeeded(context)

      expect(context.traceId).toBeDefined()
      expect(context.spanId).toBeDefined()
    })
  })
})

function toPlainObject(headers: Headers) {
  const result: { [key: string]: string } = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function tracingHeadersFor(traceId: TraceIdentifier, spanId: SpanIdentifier, samplingPriority: '1' | '0') {
  return {
    'x-datadog-origin': 'rum',
    'x-datadog-parent-id': spanId.toString(),
    'x-datadog-sampling-priority': samplingPriority,
    'x-datadog-trace-id': traceId.toString(),
  }
}

function tracingHeadersAsArrayFor(traceId: TraceIdentifier, spanId: SpanIdentifier, samplingPriority: '1' | '0') {
  return objectEntries(tracingHeadersFor(traceId, spanId, samplingPriority))
}

function headersAsArray(headers: Headers) {
  const result: Array<[string, string]> = []
  headers.forEach((value, key) => {
    result.push([key, value])
  })
  return result
}
