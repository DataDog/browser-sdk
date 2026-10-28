import { attachProfiler } from './workerProfilingAgent'
import type { WorkerScopeForProfiling } from './workerProfilingAgent'
import type { WorkerProfilingCommand, WorkerProfilingResponse } from './workerProfiling.types'

// ── Mock Profer ─────────────────────────────────────────────────────
class MockProfiler {
  static instances: MockProfiler[] = []
  static constructError: Error | undefined

  sampleInterval: number
  stopped = false
  bufferFullListeners: Array<() => void> = []

  constructor(options: { sampleInterval: number; maxBufferSize: number }) {
    if (MockProfiler.constructError) {
      throw MockProfiler.constructError
    }
    this.sampleInterval = options.sampleInterval
    MockProfiler.instances.push(this)
  }

  stop(): Promise<unknown> {
    this.stopped = true
    return Promise.resolve({ resources: [], frames: [], stacks: [], samples: [] })
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'samplebufferfull') {
      this.bufferFullListeners.push(listener)
    }
  }

  removeEventListener(_type: string, listener: () => void): void {
    this.bufferFullListeners = this.bufferFullListeners.filter((l) => l !== listener)
  }

  simulateBufferFull(): void {
    this.bufferFullListeners.forEach((l) => l())
  }
}

// ── Mock WorkerScope ────────────────────────────────────────────────
class MockWorkerScope {
  Profiler = MockProfiler as unknown as WorkerScopeForProfiling['Profiler']
  messageListeners: Array<(event: MessageEvent) => void> = []
  postedMessages: WorkerProfilingResponse[] = []

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') {
      this.messageListeners.push(listener)
    }
  }

  postMessage(message: WorkerProfilingResponse): void {
    this.postedMessages.push(message)
  }

  simulateCommand(command: WorkerProfilingCommand): void {
    const event = { data: command } as MessageEvent
    this.messageListeners.forEach((l) => l(event))
  }

  messagesOfType(type: string): WorkerProfilingResponse[] {
    return this.postedMessages.filter((m) => m.type === type)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
function setup() {
  const scope = new MockWorkerScope()
  MockProfiler.instances = []
  MockProfiler.constructError = undefined
  attachProfiler(scope)
  return { scope, MockProfiler }
}

function sendConfig(scope: MockWorkerScope, correlationId = 'test-corr-id'): void {
  scope.simulateCommand({
    type: 'dd-profiling-config',
    sampleIntervalMs: 10,
    maxBufferSize: 9000,
    collectIntervalMs: 60000,
    correlationId,
  })
}

// ── Specs ───────────────────────────────────────────────────────────

describe('workerProfilingAgent', () => {
  it('attachProfiler installs a message listener without creating a Profiler', () => {
    const { scope, MockProfiler } = setup()
    expect(scope.messageListeners.length).toBe(1)
    expect(MockProfiler.instances.length).toBe(0)
  })

  it('dd-profiling-config creates a Profiler', () => {
    const { scope, MockProfiler } = setup()
    sendConfig(scope)
    expect(MockProfiler.instances.length).toBe(1)
    expect(MockProfiler.instances[0].sampleInterval).toBe(10)
  })

  it('posts not-supported-by-browser when Profiler is unavailable', () => {
    const { scope } = setup()
    scope.Profiler = undefined
    sendConfig(scope)

    const errors = scope.messagesOfType('dd-worker-error')
    expect(errors.length).toBe(1)
    expect((errors[0] as { error: string }).error).toBe('not-supported-by-browser')
  })

  it('posts missing-document-policy-header on NotAllowedError', () => {
    const { scope, MockProfiler } = setup()
    MockProfiler.constructError = new Error('disabled by Document Policy')
    MockProfiler.constructError.name = 'NotAllowedError'
    sendConfig(scope)

    const errors = scope.messagesOfType('dd-worker-error')
    expect(errors.length).toBe(1)
    expect((errors[0] as { error: string }).error).toBe('missing-document-policy-header')
  })

  it('posts unexpected-exception on other constructor errors', () => {
    const { scope, MockProfiler } = setup()
    MockProfiler.constructError = new Error('Something broke')
    sendConfig(scope)

    const errors = scope.messagesOfType('dd-worker-error')
    expect(errors.length).toBe(1)
    expect((errors[0] as { error: string }).error).toBe('unexpected-exception')
  })

  it('dd-detach-profiler stops the current Profiler', async () => {
    const { scope, MockProfiler } = setup()
    sendConfig(scope)
    expect(MockProfiler.instances.length).toBe(1)

    scope.simulateCommand({ type: 'dd-detach-profiler' })
    // Wait for the flush to complete (profiler.stop() is async)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(MockProfiler.instances[0].stopped).toBe(true)
  })

  it('dd-profiling-config after detach creates a new Profiler (stopped flag reset)', () => {
    const { scope, MockProfiler } = setup()
    sendConfig(scope)
    scope.simulateCommand({ type: 'dd-detach-profiler' })
    expect(MockProfiler.instances.length).toBe(1)

    // New config after detach → agent should resume with a fresh Profiler
    sendConfig(scope, 'new-corr-id')
    expect(MockProfiler.instances.length).toBe(2)
  })

  it('samplebufferfull listener is registered on the active Profiler', () => {
    const { scope, MockProfiler } = setup()
    sendConfig(scope)
    expect(MockProfiler.instances[0].bufferFullListeners.length).toBeGreaterThan(0)
  })

  it('detachProfiler returns a Promise', () => {
    const scope = new MockWorkerScope()
    MockProfiler.instances = []
    const handle = attachProfiler(scope)
    const promise = handle.detachProfiler()
    expect(promise).toBeDefined()
    expect(typeof promise.then).toBe('function')
  })
})
