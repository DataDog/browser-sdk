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

  it('should not collect trace when request do not have trace id', () => {
    const { server } = setupBuilder.build()

    requestCompleteObservable.notify(requestWithoutTraceId as RequestCompleteEvent)

    expect(server.requests.length).toBe(0)
  })

  it('should collect trace when request have trace id', () => {
    const { server } = setupBuilder.build()

    requestCompleteObservable.notify(requestWithTraceId as RequestCompleteEvent)

    expect(server.requests.length).toBe(1)
    const traceRequest = server.requests[0]
    const trace = (JSON.parse(server.requests[0].requestBody) as unknown) as Trace

    expect(traceRequest.url).toBe('https://trace-intake.com/abcde?foo=bar')
    expect(trace.spans[0].trace_id).toEqual(toHexString(requestWithTraceId.traceId!))
  })
})
