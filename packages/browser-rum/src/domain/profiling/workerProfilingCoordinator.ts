import { addTelemetryDebug, display, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { Encoder, SessionManager } from '@datadog/browser-core'
import { generateUUID, noop, setTimeout } from '@datadog/js-core/util'
import { monitorError } from '@datadog/js-core/monitor'
import type { RumConfiguration, TransportPayload, LifeCycle } from '@datadog/browser-rum-core'
import { createFormDataTransport } from '@datadog/browser-rum-core'
import type { WorkerProfilingCommand, WorkerProfilingResponse, WorkerOptions, WorkerProfilingCoordinator } from './workerProfiling.types'
import { addWorkerEventListeners } from './workerEventListeners'
// WorkerRegistration is imported as a type — the interface has mutable
// stopMessageListener/stopErrorListener fields (late-assigned after creation)
import type { WorkerRegistration } from './workerEventListeners'
import { assembleWorkerProfilingPayload } from './transport/assembleWorkerProfilingPayload'

export function createWorkerProfilingCoordinator(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  session: SessionManager,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  createTransport: typeof createFormDataTransport = createFormDataTransport
): WorkerProfilingCoordinator {
  const registrations = new Map<Worker, WorkerRegistration>()
  // Use a dedicated deflate stream: sharing PROFILING with the main-thread
  // profiler interleaves concurrent encodings in the deflate worker and
  // cross-delivers compressed chunks between the two transports (duplicate or
  // crossed wall-time.json attachments).
  const transport = createTransport(configuration, lifeCycle, createEncoder, DeflateEncoderStreamId.WORKER_PROFILING)

  let activeOptions: { sampleIntervalMs: number; maxBufferSize: number; collectIntervalMs: number } | undefined
  let isPaused = false

  function attachWorker(worker: Worker, options?: WorkerOptions): () => Promise<void> {
    if (registrations.has(worker)) {
      // Already attached — return a detach function
      return () => detachWorker(worker)
    }

    const correlationId = generateUUID()

    // `registration` is declared with `let` and referenced in the listener
    // callbacks below — safe because the listeners only fire after events,
    // by which time `registration` is assigned and stored in the Map.
    // Create the registration first so the listener callbacks can look it up
    // from the Map by the time events fire (events only fire after the
    // registration is stored below).
    const registration: WorkerRegistration = {
      worker,
      name: options?.name,
      correlationId,
      stopMessageListener: noop,
      stopErrorListener: noop,
      isPaused: false,
    }

    const listeners = addWorkerEventListeners(worker, {
      onTrace: (response) => handleWorkerTrace(registration, response),
      onError: (error) => handleWorkerError(registration, error),
      onWorkerCrash: (message) => {
        // monitor-until: forever
        addTelemetryDebug('Worker profiling: worker crashed', { error: message })
        sendCommand(registration, { type: 'dd-detach-profiler' })
        teardownWorker(worker)
      },
    })

    registration.stopMessageListener = listeners.stopMessageListener
    registration.stopErrorListener = listeners.stopErrorListener

    registrations.set(worker, registration)

    // If profiling is already active (and not paused), deliver config to this
    // worker immediately. When paused, resumeWorkers will deliver it when the
    // tab becomes visible again.
    if (activeOptions && !isPaused) {
      sendCommand(registration, {
        type: 'dd-profiling-config',
        ...activeOptions,
        correlationId,
      })
    }

    return () => detachWorker(worker)
  }

  function detachWorker(worker: Worker): Promise<void> {
    const registration = registrations.get(worker)
    if (!registration) {
      return Promise.resolve()
    }

    if (!registration.isPaused) {
      sendCommand(registration, { type: 'dd-detach-profiler' })
    }

    return new Promise<void>((resolve) => {
      registration.pendingFlushResolve = resolve
      setTimeout(() => {
        resolve()
        teardownWorker(worker)
      }, 1000)
    })
  }

  function start(sampleIntervalMs: number, maxBufferSize: number, collectIntervalMs: number): void {
    activeOptions = { sampleIntervalMs, maxBufferSize, collectIntervalMs }

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
    registration.stopMessageListener()
    registration.stopErrorListener()
    registrations.delete(worker)
  }

  function handleWorkerTrace(
    registration: WorkerRegistration,
    response: Extract<WorkerProfilingResponse, { type: 'dd-worker-trace' }>
  ): void {
    registration.pendingFlushResolve?.()
    registration.pendingFlushResolve = undefined
    try {
      // Drop traces below the minimum duration threshold — mirrors
      // datadogProfiler's minProfileDurationMs check. Reduces noise and cost
      // (e.g. every tab toggle would otherwise ship a near-empty trace).
      const durationMs = response.endTimeStamp - response.startTimeStamp
      if (durationMs < 5000) {
        return
      }

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
      transport.send(payload as unknown as TransportPayload).catch(monitorError)
    } catch (e) {
      monitorError(e)
    }
  }

  function handleWorkerError(registration: WorkerRegistration, error: string): void {
    if (error === 'missing-document-policy-header') {
      display.warn(
        `[DD_RUM] Worker profiling failed for worker "${registration.name ?? 'unknown'}". ` +
          'Ensure the worker script is served with the `Document-Policy: js-profiling` HTTP response header. ' +
          'For blob: and data: URL workers, the policy is inherited from the creating document (Chromium M154+).'
      )
    } else {
      // monitor-until: forever
      addTelemetryDebug('Worker profiling error', { error, workerName: registration.name })
    }
  }

  return {
    attachWorker,
    start,
    stop,
    getCorrelationIds,
    // Hook-driven lifecycle: called by datadogProfiler's event handlers
    // (visibilitychange, beforeunload, session expiry/renewal) so that worker
    // and main-thread profiling always share a single decision point.
    pauseWorkers: () => {
      if (!activeOptions || isPaused) {
        return
      }
      isPaused = true
      registrations.forEach((registration) => {
        registration.isPaused = true
        sendCommand(registration, { type: 'dd-detach-profiler' })
      })
    },
    resumeWorkers: () => {
      if (!activeOptions || !isPaused) {
        return
      }
      isPaused = false
      registrations.forEach((registration) => {
        registration.isPaused = false
        sendCommand(registration, {
          type: 'dd-profiling-config',
          ...activeOptions!,
          correlationId: registration.correlationId,
        })
      })
    },
    flushAndRestartWorkers: () => {
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
    },
  }

  function stop(): void {
    activeOptions = undefined
    registrations.forEach((registration) => {
      if (!registration.isPaused) {
        sendCommand(registration, { type: 'dd-detach-profiler' })
      }
      teardownWorker(registration.worker)
    })
    isPaused = false
  }

  function getCorrelationIds(): string[] {
    return Array.from(registrations.values()).map((r) => r.correlationId)
  }
}
