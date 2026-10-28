import { mockRumConfiguration } from '@datadog/browser-rum-core/test'
import { createSessionManagerMock } from '@datadog/browser-core/test'
import { LifeCycle } from '@datadog/browser-rum-core'
import { createIdentityEncoder } from '@datadog/browser-core'
import { createWorkerProfilingCoordinator } from './workerProfilingCoordinator'
import type { WorkerProfilingCommand, WorkerProfilingResponse } from './workerProfiling.types'

// ── Mock Worker ─────────────────────────────────────────────────────────
class MockProfiledWorker {
  postedMessages: WorkerProfilingCommand[] = []
  messageListeners: Array<(event: MessageEvent) => void> = []
  errorListeners: Array<(event: ErrorEvent) => void> = []

  postMessage = (message: WorkerProfilingCommand): void => {
    this.postedMessages.push(message)
  }

  addEventListener = (type: string, listener: (event: never) => void): void => {
    if (type === 'message') {
      this.messageListeners.push(listener as (event: MessageEvent) => void)
    } else if (type === 'error') {
      this.errorListeners.push(listener as (event: ErrorEvent) => void)
    }
  }

  removeEventListener = (type: string, listener: (event: never) => void): void => {
    if (type === 'message') {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener)
    } else if (type === 'error') {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener)
    }
  }

  terminate = (): void => {
    // no-op
  }

  simulateWorkerMessage(response: WorkerProfilingResponse): void {
    const event = { data: response } as MessageEvent
    this.messageListeners.forEach((l) => l(event))
  }

  simulateWorkerError(message: string): void {
    const event = { message } as ErrorEvent
    this.errorListeners.forEach((l) => l(event))
  }

  messagesOfType(type: string): WorkerProfilingCommand[] {
    return this.postedMessages.filter((m) => m.type === type)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────
function createTestCoordinator() {
  const sentPayloads: unknown[] = []
  const mockCreateTransport = () => ({
    send: (payload: unknown): Promise<void> => {
      sentPayloads.push(payload)
      return Promise.resolve()
    },
  })

  const coordinator = createWorkerProfilingCoordinator(
    mockRumConfiguration(),
    new LifeCycle(),
    createSessionManagerMock().setId('test-session-id'),
    createIdentityEncoder,
    mockCreateTransport
  )

  return { coordinator, sentPayloads }
}

function makeTraceResponse(durationMs = 10000): { type: 'dd-worker-trace' } & Record<string, unknown> {
  const start = Date.now() - durationMs
  return {
    type: 'dd-worker-trace',
    trace: {
      resources: ['worker.js'],
      frames: [{ name: 'test', resourceId: 0, line: 1, column: 1 }],
      stacks: [{ frameId: 0 }],
      samples: [],
      startClocks: { relative: 0, timeStamp: start },
      endClocks: { relative: durationMs, timeStamp: start + durationMs },
      clocksOrigin: { relative: 0, timeStamp: start },
      sampleInterval: 10,
      longTasks: [],
      views: [],
    },
    startTimeStamp: start,
    endTimeStamp: start + durationMs,
    correlationId: 'test-correlation-id',
  }
}

// ── Specs ────────────────────────────────────────────────────────────────

describe('workerProfilingCoordinator', () => {
  it('attachWorker registers listeners on the worker', () => {
    const { coordinator } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker, { name: 'test-worker' })

    expect(worker.messageListeners.length).toBeGreaterThan(0)
    expect(worker.errorListeners.length).toBeGreaterThan(0)
  })

  it('start() sends dd-profiling-config to all registered workers', () => {
    const { coordinator } = createTestCoordinator()
    const worker1 = new MockProfiledWorker()
    const worker2 = new MockProfiledWorker()
    coordinator.attachWorker(worker1 as unknown as Worker, { name: 'w1' })
    coordinator.attachWorker(worker2 as unknown as Worker, { name: 'w2' })

    coordinator.start(10, 9000, 60000)

    expect(worker1.messagesOfType('dd-profiling-config').length).toBe(1)
    expect(worker2.messagesOfType('dd-profiling-config').length).toBe(1)
  })

  it('attachWorker after start() sends config immediately', () => {
    const { coordinator } = createTestCoordinator()
    coordinator.start(10, 9000, 60000)

    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)

    expect(worker.messagesOfType('dd-profiling-config').length).toBe(1)
  })

  it('pauseWorkers sends dd-detach-profiler to all workers', () => {
    const { coordinator } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)
    coordinator.start(10, 9000, 60000)

    coordinator.pauseWorkers()

    expect(worker.messagesOfType('dd-detach-profiler').length).toBe(1)
  })

  it('resumeWorkers sends dd-profiling-config after pause', () => {
    const { coordinator } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)
    coordinator.start(10, 9000, 60000)

    coordinator.pauseWorkers()
    coordinator.resumeWorkers()

    expect(worker.messagesOfType('dd-profiling-config').length).toBe(2) // start + resume
    expect(worker.messagesOfType('dd-detach-profiler').length).toBe(1)
  })

  it('resumeWorkers without prior pause is a no-op', () => {
    const { coordinator } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)
    coordinator.start(10, 9000, 60000)

    coordinator.resumeWorkers()

    expect(worker.messagesOfType('dd-profiling-config').length).toBe(1) // only from start()
  })

  it('flushAndRestartWorkers sends both commands', () => {
    const { coordinator } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)
    coordinator.start(10, 9000, 60000)

    coordinator.flushAndRestartWorkers()

    expect(worker.messagesOfType('dd-detach-profiler').length).toBe(1)
    expect(worker.messagesOfType('dd-profiling-config').length).toBe(2) // start + flushAndRestart
  })

  it('stop() deregisters all workers', () => {
    const { coordinator } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)
    coordinator.start(10, 9000, 60000)

    coordinator.stop()

    expect(worker.messagesOfType('dd-detach-profiler').length).toBe(1)
    expect(worker.messageListeners.length).toBe(0)
    expect(worker.errorListeners.length).toBe(0)
  })

  it('getCorrelationIds returns one unique ID per worker', () => {
    const { coordinator } = createTestCoordinator()
    coordinator.attachWorker(new MockProfiledWorker() as unknown as Worker)
    coordinator.attachWorker(new MockProfiledWorker() as unknown as Worker)

    const ids = coordinator.getCorrelationIds()
    expect(ids.length).toBe(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('worker error event deregisters the worker and sends dd-detach-profiler', () => {
    const { coordinator } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)
    coordinator.start(10, 9000, 60000)

    worker.simulateWorkerError('Uncaught error')

    expect(worker.messagesOfType('dd-detach-profiler').length).toBe(1)
    expect(worker.messageListeners.length).toBe(0)
  })

  it('traces below 5s are dropped (min-duration)', () => {
    const { coordinator, sentPayloads } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)
    coordinator.start(10, 9000, 60000)

    worker.simulateWorkerMessage(makeTraceResponse(3000) as never)

    expect(sentPayloads.length).toBe(0)
  })

  it('traces above 5s are sent with worker tags', () => {
    const { coordinator, sentPayloads } = createTestCoordinator()
    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker, { name: 'test-worker' })
    coordinator.start(10, 9000, 60000)

    worker.simulateWorkerMessage(makeTraceResponse(10000) as never)

    expect(sentPayloads.length).toBe(1)
    const payload = sentPayloads[0] as { event: { tags_profiler: string } }
    expect(payload.event.tags_profiler).toContain('thread:worker')
    expect(payload.event.tags_profiler).toContain('worker.name:test-worker')
  })

  it('workers attached while paused do not receive immediate config', () => {
    const { coordinator } = createTestCoordinator()
    coordinator.start(10, 9000, 60000)
    coordinator.pauseWorkers()

    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)

    expect(worker.messagesOfType('dd-profiling-config').length).toBe(0)
  })

  it('workers attached while paused receive config on resume', () => {
    const { coordinator } = createTestCoordinator()
    coordinator.start(10, 9000, 60000)
    coordinator.pauseWorkers()

    const worker = new MockProfiledWorker()
    coordinator.attachWorker(worker as unknown as Worker)

    coordinator.resumeWorkers()
    expect(worker.messagesOfType('dd-profiling-config').length).toBe(1)
  })
})
