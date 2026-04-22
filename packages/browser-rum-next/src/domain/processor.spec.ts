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
    ...overrides,
  }
}

describe('startProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
  })

  it('transforms resource:performance_entry into observation:rum_resource', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:rum_resource', (data) => observations.push(data))

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
    pipeline.subscribe('observation:rum_resource', (data) => observations.push(data))

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
    pipeline.subscribe('observation:rum_resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(1)
    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.method).toBeUndefined()
  })

  it('transforms resource:runtime_error into observation:rum_error', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:rum_error', (data) => observations.push(data))

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
  })

  it('transforms resource:long_task into observation:rum_long_task', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:rum_long_task', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig() })
    pipeline.seal()

    pipeline.publish('resource:long_task', { startTime: 500, duration: 150 })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('long_task')
    const longTask = obs.long_task as Record<string, unknown>
    expect(longTask.duration).toBe(150)
  })

  it('does not publish resources when trackResources is false', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:rum_resource', (data) => observations.push(data))

    startProcessor({ pipeline, config: makeConfig({ trackResources: false }) })
    pipeline.seal()

    pipeline.publish('resource:performance_entry', makePerformanceEntry())
    await tick()

    expect(observations.length).toBe(0)
  })
})
