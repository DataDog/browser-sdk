import { Batch, Configuration, Context, getTimestamp, HttpRequest, msToNs, Observable } from '@datadog/browser-core'
import { RequestCompleteEvent } from './requestCollection'
import { InternalContext } from './rum.entry'
import { isTracingSupported, toHexString } from './tracer'

export interface SpanMetadata {
  [key: string]: string | undefined
}

export interface SpanMetrics {
  [key: string]: number
}

export interface Span extends Context {
  trace_id: string
  span_id: string
  parent_id: string
  name: string
  resource: string
  error: number
  meta: SpanMetadata
  metrics: SpanMetrics
  start: number
  duration: number
  service: string
  type: string
}

export interface TraceMetadata {
  [key: string]: string
}

export interface Trace extends Context {
  spans: Span[]
  meta: TraceMetadata
}

export function startTraceCollection(
  configuration: Configuration,
  requestCompleteObservable: Observable<RequestCompleteEvent>,
  getRumInternalContext: (startTime?: number) => InternalContext | undefined
) {
  if (!isTracingSupported()) {
    return
  }
  const batch = startTraceBatch()
  requestCompleteObservable.subscribe((request: RequestCompleteEvent) => {
    if (request.traceId) {
      batch.add(buildTrace(request))
    }
  })

  function startTraceBatch() {
    const primaryBatch = createTraceBatch(configuration.traceEndpoint)

    let replicaBatch: Batch | undefined
    if (configuration.replica !== undefined) {
      replicaBatch = createTraceBatch(configuration.replica.traceEndpoint)
    }

    function createTraceBatch(endpointUrl: string) {
      return new Batch(
        new HttpRequest(endpointUrl, configuration.batchBytesLimit),
        configuration.maxBatchSize,
        configuration.batchBytesLimit,
        configuration.maxMessageSize,
        configuration.flushTimeout
      )
    }

    return {
      add(message: Trace) {
        primaryBatch.add(message)
        if (replicaBatch) {
          replicaBatch.add(message)
        }
      },
    }
  }

  function buildTrace(request: RequestCompleteEvent) {
    const traceId = toHexString(request.traceId!)
    const globalMeta: SpanMetadata = {}

    globalMeta.service = configuration.service ? `${configuration.service}-http-client` : 'browser'
    if (configuration.env) {
      globalMeta.env = configuration.env
    }
    if (configuration.version) {
      globalMeta.version = configuration.version
    }

    const meta: SpanMetadata = {
      ...globalMeta,
      ...((getRumInternalContext(request.startTime) as unknown) as SpanMetadata),
      'http.method': request.method,
      'http.url': request.url,
      'span.kind': 'client',
    }

    if (request.error) {
      meta['error.type'] = request.error.name
      meta['error.msg'] = request.error.message
      meta['error.stack'] = request.error.stack
    }

    const metrics = {
      '_dd.agent_psr': 1,
      _sample_rate: 1,
      _sampling_priority_v1: 1,
      _top_level: 1,
      'http.status': request.status,
    }

    const span: Span = {
      meta,
      metrics,
      duration: msToNs(request.duration),
      error: request.status === 0 || request.error ? 1 : 0,
      name: 'browser.request',
      parent_id: '0000000000000000',
      resource: request.method,
      service: globalMeta.service,
      span_id: traceId,
      start: msToNs(getTimestamp(request.startTime)),
      trace_id: traceId,
      type: 'http',
    }

    const trace: Trace = {
      meta: { ...globalMeta, '_dd.source': 'browser' },
      spans: [span],
    }

    return trace
  }
}
