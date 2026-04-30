import { Pipeline } from '@datadog/core-next'
import type { NetworkRequestResource } from '@datadog/core-next'
import type { RumConfig } from './configuration'
import { startProcessor } from './processor'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

function makePerformanceEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    name: 'https://example.com/api/data',
    entryType: 'resource',
    startTime: 100,
    duration: 200,
    initiatorType: 'fetch',
    transferSize: 1024,
    encodedBodySize: 512,
    decodedBodySize: 1024,
    responseStatus: 200,
    renderBlockingStatus: undefined,
    deliveryType: undefined,
    nextHopProtocol: undefined,
    redirectStart: 0,
    redirectEnd: 0,
    domainLookupStart: 10,
    domainLookupEnd: 20,
    connectStart: 20,
    connectEnd: 30,
    secureConnectionStart: 0,
    requestStart: 30,
    responseStart: 80,
    responseEnd: 100,
    ...overrides,
  }
}

function makeNetworkRequest(overrides: Partial<NetworkRequestResource> = {}): NetworkRequestResource {
  return {
    method: 'GET',
    url: 'https://example.com/api/data',
    status: 200,
    isAborted: false,
    startTime: 100,
    startDate: Date.now(),
    duration: 200,
    ...overrides,
  }
}

function makeConfig(overrides: Partial<RumConfig> = {}): RumConfig {
  return {
    trackResources: true,
    trackLongTasks: true,
    trackErrors: true,
    tracingOptions: [],
    traceSampleRate: 100,
    traceContextInjection: 'sampled',
    ...overrides,
  }
}

describe('startProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
  })

  it('transforms resource:performance_entry into observation:resource', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('resource')
    const resource = obs.resource as Record<string, unknown>
    expect(resource.url).toBe('https://example.com/api/data')
    expect(resource.type).toBe('fetch')
    expect(resource.duration).toBe(200)
    expect(resource.dns).toEqual({ duration: 10, start: 10 })
    expect(resource.connect).toEqual({ duration: 10, start: 20 })
    expect(resource.first_byte).toEqual({ duration: 50, start: 30 })
    expect(resource.download).toEqual({ duration: 20, start: 80 })
  })

  it('enriches rum_resource with matched network_request data', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:network_request', makeNetworkRequest({ method: 'POST', status: 201, url: 'https://example.com/api/data', startTime: 100 }))
    pipeline.publish('resource:performance_entry', makePerformanceEntry({ responseStatus: 0 }))
    await tick()

    expect(observations.length).toBe(1)
    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.method).toBe('POST')
    expect(resource.status_code).toBe(201)
  })

  it('publishes rum_resource without network match', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(1)
    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.method).toBeUndefined()
  })

  it('transforms resource:runtime_error into observation:error', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:error', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:runtime_error', {
      message: 'Something went wrong',
      type: 'TypeError',
      stack: 'TypeError: Something went wrong\n  at foo.js:1:1',
      source: 'source',
    })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('error')
    const error = obs.error as Record<string, unknown>
    expect(error.message).toBe('Something went wrong')
    expect(error.type).toBe('TypeError')
    expect(error.source).toBe('source')
    expect(error.id).toBeDefined()
    expect(error.handling).toBe('unhandled')
    const view = obs.view as Record<string, unknown>
    expect(typeof view.in_foreground).toBe('boolean')
  })

  it('transforms resource:console error into observation:error', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:error', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:console', {
      api: 'error',
      message: 'Console error from playground',
      error: new Error('console error'),
    })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('error')
    const error = obs.error as Record<string, unknown>
    expect(error.message).toBe('Console error from playground')
    expect(error.source).toBe('console')
    expect(error.handling).toBe('handled')
  })

  it('does not forward non-error console messages to RUM', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:error', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:console', { api: 'log', message: 'just a log' })
    pipeline.publish('resource:console', { api: 'warn', message: 'just a warning' })
    await tick()

    expect(observations.length).toBe(0)
  })

  it('action:add_error publishes handled error', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:error', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('action:add_error', {
      message: 'User caught this',
      type: 'Error',
    })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    const error = obs.error as Record<string, unknown>
    expect(error.handling).toBe('handled')
    expect(error.source).toBe('custom')
    expect(error.id).toBeDefined()
  })

  it('transforms resource:long_task into observation:long_task', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:long_task', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:long_task', { startTime: 500, duration: 150 })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('long_task')
    const longTask = obs.long_task as Record<string, unknown>
    expect(longTask.duration).toBe(150)
    expect(longTask.id).toBeDefined()
    expect(longTask.entry_type).toBe('long-task')
    expect(longTask.start_time).toBe(500)
  })

  it('transforms resource:long_animation_frame into observation:long_task with entry_type long-animation-frame', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:long_task', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:long_animation_frame', {
      startTime: 1000,
      duration: 200,
      blockingDuration: 150,
      renderStart: 1050,
      styleAndLayoutStart: 1080,
      firstUIEventTimestamp: 1010,
      scripts: [],
    })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('long_task')
    const longTask = obs.long_task as Record<string, unknown>
    expect(longTask.id).toBeDefined()
    expect(longTask.entry_type).toBe('long-animation-frame')
    expect(longTask.duration).toBe(200)
    expect(longTask.start_time).toBe(1000)
    expect(longTask.first_ui_event_timestamp).toBe(1010)
  })

  it('resource observation includes resource.id', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.id).toBeDefined()
    expect(typeof resource.id).toBe('string')
  })

  it('resource observation includes worker timing when workerStart < fetchStart', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry({ workerStart: 5, fetchStart: 15 }))
    await tick()

    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.worker).toBeDefined()
    const worker = resource.worker as Record<string, unknown>
    expect(worker.start).toBe(5)
    expect(worker.duration).toBe(10)
  })

  it('resource observation omits worker timing when workerStart is 0', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry({ workerStart: 0, fetchStart: 15 }))
    await tick()

    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.worker).toBeUndefined()
  })

  it('includes _dd.trace_id and _dd.span_id when network match has traceId and spanId', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig({ traceSampleRate: 50 }) })
    pipeline.seal()

    pipeline.publish(
      'resource:network_request',
      makeNetworkRequest({ traceId: 'abc123' as any, spanId: 'def456' as any })
    )
    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    const dd = obs._dd as Record<string, unknown>
    expect(dd).toBeDefined()
    expect(dd.trace_id).toBe('abc123')
    expect(dd.span_id).toBe('def456')
    expect(dd.rule_psr).toBe(0.5)
  })

  it('does not include _dd when network match has no traceId', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:network_request', makeNetworkRequest())
    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs._dd).toBeUndefined()
  })

  it('does not include _dd when there is no network match', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs._dd).toBeUndefined()
  })

  it('rule_psr is between 0 and 1', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig({ traceSampleRate: 75 }) })
    pipeline.seal()

    pipeline.publish(
      'resource:network_request',
      makeNetworkRequest({ traceId: 'tid' as any, spanId: 'sid' as any })
    )
    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    const obs = observations[0] as Record<string, unknown>
    const dd = obs._dd as Record<string, unknown>
    const rulePsr = dd.rule_psr as number
    expect(rulePsr).toBeGreaterThanOrEqual(0)
    expect(rulePsr).toBeLessThanOrEqual(1)
    expect(rulePsr).toBe(0.75)
  })

  it('does not publish resources when trackResources is false', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig({ trackResources: false }) })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(0)
  })
})
