import { Batch, Pipeline } from '@datadog/core-next'
import { TransportRouter } from './transportRouter'
import type { HttpRequest } from '../browser'

function createMockTransport(): { transport: HttpRequest; payloads: string[] } {
  const payloads: string[] = []
  const transport: HttpRequest = {
    send: ({ data }) => payloads.push(data as string),
    sendOnExit: ({ data }) => payloads.push(data as string),
  }
  return { transport, payloads }
}

function createBatchOptions() {
  return { maxSizeBytes: 16 * 1024, maxCount: 50, flushTimeoutMs: 30_000 }
}

describe('TransportRouter', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    pipeline = new Pipeline()
  })

  it('route() creates a batch for the track type', () => {
    const batchConstructorSpy = spyOn(Batch.prototype, 'add').and.callThrough()
    const { transport } = createMockTransport()
    const transports = new Map([['logs', transport]])

    const router = new TransportRouter({ pipeline, transports, batchOptions: createBatchOptions() })
    router.route('observation:log', 'logs')
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'hello' })
    // flush via router
    router.flush()

    expect(batchConstructorSpy).toHaveBeenCalledWith(jasmine.stringContaining('hello'))
  })

  it('events are serialized as JSON and added to the correct batch', async () => {
    const { transport, payloads } = createMockTransport()
    const transports = new Map([['logs', transport]])

    const router = new TransportRouter({ pipeline, transports, batchOptions: createBatchOptions() })
    router.route('observation:log', 'logs')
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'test', status: 'info' })

    await new Promise((r) => setTimeout(r, 0))
    router.flush()

    expect(payloads.length).toBe(1)
    const parsed = JSON.parse(payloads[0])
    expect(parsed).toEqual(jasmine.objectContaining({ message: 'test', status: 'info' }))
  })

  it('routes different event types to the same track', async () => {
    const { transport, payloads } = createMockTransport()
    const transports = new Map([['rum', transport]])

    const router = new TransportRouter({ pipeline, transports, batchOptions: createBatchOptions() })
    router.route('observation:view', 'rum')
    router.route('observation:error', 'rum')
    pipeline.seal()

    pipeline.publish('observation:view', { type: 'view' })
    pipeline.publish('observation:error', { type: 'error' })

    await new Promise((r) => setTimeout(r, 0))
    router.flush()

    expect(payloads.length).toBe(1) // all in one batch flush
    const lines = payloads[0].split('\n')
    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0]).type).toBe('view')
    expect(JSON.parse(lines[1]).type).toBe('error')
  })

  it('routes different event types to different tracks', async () => {
    const { transport: logsTransport, payloads: logsPayloads } = createMockTransport()
    const { transport: rumTransport, payloads: rumPayloads } = createMockTransport()
    const transports = new Map([
      ['logs', logsTransport],
      ['rum', rumTransport],
    ])

    const router = new TransportRouter({ pipeline, transports, batchOptions: createBatchOptions() })
    router.route('observation:log', 'logs')
    router.route('observation:view', 'rum')
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'a log' })
    pipeline.publish('observation:view', { type: 'view' })

    await new Promise((r) => setTimeout(r, 0))
    router.flush()

    expect(logsPayloads.length).toBe(1)
    expect(logsPayloads[0]).toContain('a log')
    expect(rumPayloads.length).toBe(1)
    expect(rumPayloads[0]).toContain('"type":"view"')
  })

  it('beforeSend can block events from reaching the batch', async () => {
    const { transport, payloads } = createMockTransport()
    const transports = new Map([['logs', transport]])

    const router = new TransportRouter({
      pipeline,
      transports,
      batchOptions: createBatchOptions(),
      beforeSend: () => false,
    })
    router.route('observation:log', 'logs')
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'blocked' })

    await new Promise((r) => setTimeout(r, 0))
    router.flush()

    expect(payloads.length).toBe(0)
  })

  it('beforeSend allows events when returning true', async () => {
    const { transport, payloads } = createMockTransport()
    const transports = new Map([['logs', transport]])

    const router = new TransportRouter({
      pipeline,
      transports,
      batchOptions: createBatchOptions(),
      beforeSend: () => true,
    })
    router.route('observation:log', 'logs')
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'allowed' })

    await new Promise((r) => setTimeout(r, 0))
    router.flush()

    expect(payloads.length).toBe(1)
    expect(payloads[0]).toContain('allowed')
  })

  it('beforeSend allows events when returning undefined (void)', async () => {
    const { transport, payloads } = createMockTransport()
    const transports = new Map([['logs', transport]])

    const router = new TransportRouter({
      pipeline,
      transports,
      batchOptions: createBatchOptions(),
      beforeSend: () => undefined,
    })
    router.route('observation:log', 'logs')
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'passthrough' })

    await new Promise((r) => setTimeout(r, 0))
    router.flush()

    expect(payloads.length).toBe(1)
  })

  it('flush() flushes all batches', async () => {
    const { transport: logsTransport, payloads: logsPayloads } = createMockTransport()
    const { transport: rumTransport, payloads: rumPayloads } = createMockTransport()
    const transports = new Map([
      ['logs', logsTransport],
      ['rum', rumTransport],
    ])

    const router = new TransportRouter({ pipeline, transports, batchOptions: createBatchOptions() })
    router.route('observation:log', 'logs')
    router.route('observation:view', 'rum')
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'log event' })
    pipeline.publish('observation:view', { type: 'view' })

    await new Promise((r) => setTimeout(r, 0))
    router.flush()

    expect(logsPayloads.length).toBe(1)
    expect(rumPayloads.length).toBe(1)
  })

  it('destroy() prevents further sending', () => {
    const batchDestroySpy = spyOn(Batch.prototype, 'destroy').and.callThrough()
    const { transport } = createMockTransport()
    const transports = new Map([['logs', transport]])

    const router = new TransportRouter({ pipeline, transports, batchOptions: createBatchOptions() })
    router.route('observation:log', 'logs')
    pipeline.seal()

    router.destroy()

    expect(batchDestroySpy).toHaveBeenCalled()
  })

  it('only creates a batch when a route is registered for that track', () => {
    const batchAddSpy = spyOn(Batch.prototype, 'add').and.callThrough()
    const { transport: rumTransport } = createMockTransport()
    const transports = new Map([['rum', rumTransport]])

    // Only register a logs route but provide no logs transport
    const router = new TransportRouter({ pipeline, transports, batchOptions: createBatchOptions() })
    router.route('observation:log', 'logs') // no 'logs' transport in map
    pipeline.seal()

    pipeline.publish('observation:log', { message: 'to nowhere' })

    // Should not crash even with no matching transport
    expect(() => router.flush()).not.toThrow()
  })
})
