import { generateUUID, addTelemetryDebug, display, monitorError, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { RumConfiguration, TransportPayload } from '@datadog/browser-rum-core'
import { createFormDataTransport } from '@datadog/browser-rum-core'
import type { Encoder, SessionManager } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import type { WorkerProfilingCommand, WorkerProfilingResponse } from './workerProfiling.types'
import { assembleWorkerProfilingPayload } from './transport/assembleWorkerProfilingPayload'

interface WorkerRegistration {
  worker: Worker
  /** Developer-provided label. Falls back to the worker's script URL if not provided. */
  name: string | undefined
  /**
   * Stable UUID generated once when the worker is registered.
   * Reused across all collection intervals for this worker instance.
   */
  correlationId: string
  messageListener: (event: MessageEvent) => void
  errorListener: (event: ErrorEvent) => void
}

interface WorkerOptions {
  name?: string
}

export interface WorkerProfilingCoordinator {
  registerWorker(worker: Worker, options?: WorkerOptions): () => void
  start(sampleIntervalMs: number, maxBufferSize: number, collectIntervalMs: number): void
  stop(): void
  getCorrelationIds(): string[]
}

export function createWorkerProfilingCoordinator(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  session: SessionManager,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
): WorkerProfilingCoordinator {
  const registrations = new Map<Worker, WorkerRegistration>()
  const transport = createFormDataTransport(configuration, lifeCycle, createEncoder, DeflateEncoderStreamId.PROFILING)

  let activeOptions: { sampleIntervalMs: number; maxBufferSize: number; collectIntervalMs: number } | undefined

  function registerWorker(worker: Worker, options?: WorkerOptions): () => void {
    if (registrations.has(worker)) {
      // Already registered — return a no-op unregister
      return () => unregisterWorker(worker)
    }

    const correlationId = generateUUID()
    console.log(`[DD Coordinator] registerWorker name=${options?.name ?? '(unnamed)'} correlationId=${correlationId}`)

    const messageListener = (event: MessageEvent) => {
      const response = event.data as WorkerProfilingResponse
      if (!response || typeof response.type !== 'string') {
        return
      }
      console.log(`[DD Coordinator] received from worker: ${response.type}`)
      if (response.type === 'dd-worker-trace') {
        handleWorkerTrace(registration, response)
      } else if (response.type === 'dd-worker-error') {
        handleWorkerError(registration, response.error)
      }
    }

    const errorListener = (event: ErrorEvent) => {
      addTelemetryDebug('Worker profiling: worker crashed', { error: event.message })
      teardownWorker(worker)
    }

    const registration: WorkerRegistration = {
      worker,
      name: options?.name,
      correlationId,
      messageListener,
      errorListener,
    }

    worker.addEventListener('message', messageListener)
    worker.addEventListener('error', errorListener)
    registrations.set(worker, registration)

    // If profiling is already active, start this worker immediately
    if (activeOptions) {
      console.log(
        `[DD Coordinator] profiling already active — sending dd-start-profiling immediately to worker ${registration.name ?? '(unnamed)'}`
      )
      sendCommand(registration, {
        type: 'dd-start-profiling',
        ...activeOptions,
        correlationId,
      })
    } else {
      console.log(`[DD Coordinator] profiling not yet active — worker will start when start() is called`)
    }

    return () => unregisterWorker(worker)
  }

  function unregisterWorker(worker: Worker): void {
    const registration = registrations.get(worker)
    if (!registration) {
      return
    }
    sendCommand(registration, { type: 'dd-stop-profiling' })
    teardownWorker(worker)
  }

  function start(sampleIntervalMs: number, maxBufferSize: number, collectIntervalMs: number): void {
    console.log(
      `[DD Coordinator] start() — ${registrations.size} worker(s) registered sampleInterval=${sampleIntervalMs}ms collectInterval=${collectIntervalMs}ms`
    )
    activeOptions = { sampleIntervalMs, maxBufferSize, collectIntervalMs }
    registrations.forEach((registration) => {
      console.log(
        `[DD Coordinator] sending dd-start-profiling to worker ${registration.name ?? '(unnamed)'} correlationId=${registration.correlationId}`
      )
      sendCommand(registration, {
        type: 'dd-start-profiling',
        sampleIntervalMs,
        maxBufferSize,
        collectIntervalMs,
        correlationId: registration.correlationId,
      })
    })
  }

  function stop(): void {
    console.log('[DD Coordinator] stop() — sending dd-stop-profiling to all workers')
    activeOptions = undefined
    registrations.forEach((registration) => {
      sendCommand(registration, { type: 'dd-stop-profiling' })
      teardownWorker(registration.worker)
    })
  }

  function getCorrelationIds(): string[] {
    return Array.from(registrations.values()).map((r) => r.correlationId)
  }

  function sendCommand(registration: WorkerRegistration, command: WorkerProfilingCommand): void {
    try {
      registration.worker.postMessage(command)
    } catch (e) {
      monitorError(e)
    }
  }

  function teardownWorker(worker: Worker): void {
    const registration = registrations.get(worker)
    if (!registration) {
      return
    }
    worker.removeEventListener('message', registration.messageListener)
    worker.removeEventListener('error', registration.errorListener)
    registrations.delete(worker)
  }

  function handleWorkerTrace(
    registration: WorkerRegistration,
    response: Extract<WorkerProfilingResponse, { type: 'dd-worker-trace' }>
  ): void {
    try {
      const sessionId = session.findTrackedSession()?.id
      const durationMs = response.endTimeStamp - response.startTimeStamp
      console.log(
        `[DD Coordinator] handleWorkerTrace — worker=${registration.name ?? '(unnamed)'} correlationId=${response.correlationId} durationMs=${durationMs} sessionId=${sessionId ?? '(none)'}`
      )
      const payload = assembleWorkerProfilingPayload(
        response.trace,
        response.startTimeStamp,
        response.endTimeStamp,
        response.correlationId,
        registration.name,
        configuration,
        sessionId
      )
      console.log('[DD Coordinator] sending worker profile payload via transport')
      void transport.send(payload as unknown as TransportPayload)
    } catch (e) {
      console.error('[DD Coordinator] handleWorkerTrace error:', e)
      monitorError(e)
    }
  }

  function handleWorkerError(
    registration: WorkerRegistration,
    error: WorkerProfilingResponse extends { type: 'dd-worker-error' } ? never : string
  ): void
  function handleWorkerError(registration: WorkerRegistration, error: string): void {
    if (error === 'missing-document-policy-header') {
      display.warn(
        `[DD_RUM] Worker profiling failed for worker "${registration.name ?? 'unknown'}". ` +
          'Ensure the worker script is served with the `Document-Policy: js-profiling` HTTP response header. ' +
          'Note: blob: and data: URL workers are not yet supported.'
      )
    } else {
      addTelemetryDebug('Worker profiling error', { error, workerName: registration.name })
    }
  }

  return { registerWorker, start, stop, getCorrelationIds }
}
