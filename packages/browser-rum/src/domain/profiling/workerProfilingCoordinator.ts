import {
  generateUUID,
  addTelemetryDebug,
  display,
  monitorError,
  DeflateEncoderStreamId,
  addEventListener,
  DOM_EVENT,
} from '@datadog/browser-core'
import type { Encoder, SessionManager } from '@datadog/browser-core'
import type { RumConfiguration, TransportPayload, LifeCycle } from '@datadog/browser-rum-core'
import { createFormDataTransport } from '@datadog/browser-rum-core'
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
  attachWorker(worker: Worker, options?: WorkerOptions): () => void
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
  let isPaused = false
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let stopPageEventListeners: () => void = () => {}

  function attachWorker(worker: Worker, options?: WorkerOptions): () => void {
    if (registrations.has(worker)) {
      // Already attached — return a detach function
      return () => detachWorker(worker)
    }

    const correlationId = generateUUID()

    const messageListener = (event: MessageEvent) => {
      const response = event.data as WorkerProfilingResponse
      if (!response || typeof response.type !== 'string') {
        return
      }
      if (response.type === 'dd-worker-trace') {
        handleWorkerTrace(registration, response)
      } else if (response.type === 'dd-worker-error') {
        handleWorkerError(registration, response.error)
      }
    }

    const errorListener = (event: ErrorEvent) => {
      // monitor-until: forever
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

    // Safe: Worker.addEventListener is not patched by Zone.js
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    worker.addEventListener('message', messageListener)
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    worker.addEventListener('error', errorListener)
    registrations.set(worker, registration)

    // If profiling is already active, deliver config to this worker immediately
    if (activeOptions) {
      sendCommand(registration, {
        type: 'dd-profiling-config',
        ...activeOptions,
        correlationId,
      })
    }

    return () => detachWorker(worker)
  }

  function detachWorker(worker: Worker): void {
    const registration = registrations.get(worker)
    if (!registration) {
      return
    }
    // Only flush if not already paused (paused workers already received dd-detach-profiler)
    if (!isPaused) {
      sendCommand(registration, { type: 'dd-detach-profiler' })
    }
    teardownWorker(worker)
  }

  function start(sampleIntervalMs: number, maxBufferSize: number, collectIntervalMs: number): void {
    activeOptions = { sampleIntervalMs, maxBufferSize, collectIntervalMs }

    // Hook page-level events so workers are flushed on visibility change / unload,
    // mirroring what datadogProfiler does for the main-thread profiler.
    const { stop: stopVisibility } = addEventListener(window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange)
    const { stop: stopBeforeUnload } = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload)
    stopPageEventListeners = () => {
      stopVisibility()
      stopBeforeUnload()
    }

    registrations.forEach((registration) => {
      sendCommand(registration, {
        type: 'dd-profiling-config',
        sampleIntervalMs,
        maxBufferSize,
        collectIntervalMs,
        correlationId: registration.correlationId,
      })
    })
  }

  /**
   * Flush all workers: send dd-detach-profiler so each worker stops its current
   * Profiler instance and posts the trace back.
   */
  function pauseAllWorkers(): void {
    if (!activeOptions || isPaused) {
      return
    }
    isPaused = true
    registrations.forEach((registration) => {
      sendCommand(registration, { type: 'dd-detach-profiler' })
    })
  }

  /**
   * Re-deliver dd-profiling-config to all workers so they start a fresh
   * Profiler instance. Called when the tab becomes visible again.
   */
  function resumeAllWorkers(): void {
    if (!activeOptions || !isPaused) {
      return
    }
    isPaused = false
    registrations.forEach((registration) => {
      sendCommand(registration, {
        type: 'dd-profiling-config',
        ...activeOptions!,
        correlationId: registration.correlationId,
      })
    })
  }

  /**
   * Flush all workers and immediately restart them. Used on beforeunload, which
   * can fire even when the page stays alive (e.g. mailto: links) — mirrors
   * datadogProfiler's handleBeforeUnload behaviour.
   */
  function flushAndRestartAllWorkers(): void {
    if (!activeOptions) {
      return
    }
    registrations.forEach((registration) => {
      sendCommand(registration, { type: 'dd-detach-profiler' })
      sendCommand(registration, {
        type: 'dd-profiling-config',
        ...activeOptions!,
        correlationId: registration.correlationId,
      })
    })
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      pauseAllWorkers()
    } else if (document.visibilityState === 'visible') {
      resumeAllWorkers()
    }
  }

  function handleBeforeUnload(): void {
    flushAndRestartAllWorkers()
  }

  function stop(): void {
    stopPageEventListeners()
    activeOptions = undefined
    registrations.forEach((registration) => {
      // Only flush if not already paused (paused workers already received dd-detach-profiler)
      if (!isPaused) {
        sendCommand(registration, { type: 'dd-detach-profiler' })
      }
      teardownWorker(registration.worker)
    })
    isPaused = false
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
    // Safe: Worker.removeEventListener is not patched by Zone.js
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    worker.removeEventListener('message', registration.messageListener)
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    worker.removeEventListener('error', registration.errorListener)
    registrations.delete(worker)
  }

  function handleWorkerTrace(
    registration: WorkerRegistration,
    response: Extract<WorkerProfilingResponse, { type: 'dd-worker-trace' }>
  ): void {
    try {
      const sessionId = session.findTrackedSession()?.id
      const payload = assembleWorkerProfilingPayload(
        response.trace,
        response.startTimeStamp,
        response.endTimeStamp,
        response.correlationId,
        registration.name,
        configuration,
        sessionId
      )
      void transport.send(payload as unknown as TransportPayload)
    } catch (e) {
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
      // monitor-until: forever
      addTelemetryDebug('Worker profiling error', { error, workerName: registration.name })
    }
  }

  return { attachWorker, start, stop, getCorrelationIds }
}
