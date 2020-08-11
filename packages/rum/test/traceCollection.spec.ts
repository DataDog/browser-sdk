import { Observable } from '@datadog/browser-core'
import { RequestCompleteEvent } from '../src/requestCollection'
import { Trace } from '../src/traceCollection'
import { toHexString, TraceIdentifier } from '../src/tracer'
import { setup, TestSetupBuilder } from './specHelper'

describe('trace collection', () => {
  const requestWithoutTraceId: Partial<RequestCompleteEvent> = {}
  const requestWithTraceId: Partial<RequestCompleteEvent> = { ...requestWithoutTraceId, traceId: new TraceIdentifier() }

  let requestCompleteObservable: Observable<RequestCompleteEvent>
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    requestCompleteObservable = new Observable()
    setupBuilder = setup()
      .withTraceCollection(requestCompleteObservable)
      .withFakeServer()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should not collect trace when tracing is disabled', () => {
    const { server } = setupBuilder.withConfiguration({ enableTracing: false }).build()

    requestCompleteObservable.notify(requestWithTraceId as RequestCompleteEvent)

    expect(server.requests.length).toBe(0)
  })

  it('should not collect trace when request do not have trace id', () => {
    const { server } = setupBuilder.withConfiguration({ enableTracing: true }).build()

    requestCompleteObservable.notify(requestWithoutTraceId as RequestCompleteEvent)

    expect(server.requests.length).toBe(0)
  })

  it('should collect trace when request have trace id', () => {
    const { server } = setupBuilder.withConfiguration({ enableTracing: true }).build()

    requestCompleteObservable.notify(requestWithTraceId as RequestCompleteEvent)

    expect(server.requests.length).toBe(1)
    const traceRequest = server.requests[0]
    const trace = (JSON.parse(server.requests[0].requestBody) as unknown) as Trace

    expect(traceRequest.url).toBe('https://trace-intake.com/abcde?foo=bar')
    expect(trace.spans[0].trace_id).toEqual(toHexString(requestWithTraceId.traceId!))
  })

  it('should flag span as error when browser fail to send the request', () => {
    const { server } = setupBuilder.withConfiguration({ enableTracing: true }).build()
    const failedRequest = { ...requestWithTraceId, status: 0 }

    requestCompleteObservable.notify(failedRequest as RequestCompleteEvent)

    expect(server.requests.length).toBe(1)
    const trace = (JSON.parse(server.requests[0].requestBody) as unknown) as Trace
    expect(trace.spans[0].error).toBe(1)
  })

  it('should flag span and attach error context when request error is available', () => {
    const { server } = setupBuilder.withConfiguration({ enableTracing: true }).build()
    const failedRequest = { ...requestWithTraceId, error: { name: 'foo', message: 'bar', stack: 'qux' } }

    requestCompleteObservable.notify(failedRequest as RequestCompleteEvent)

    expect(server.requests.length).toBe(1)
    const trace = (JSON.parse(server.requests[0].requestBody) as unknown) as Trace
    expect(trace.spans[0].error).toBe(1)
    expect(trace.spans[0].meta['error.type']).toBe('foo')
    expect(trace.spans[0].meta['error.msg']).toBe('bar')
    expect(trace.spans[0].meta['error.stack']).toBe('qux')
  })
})
