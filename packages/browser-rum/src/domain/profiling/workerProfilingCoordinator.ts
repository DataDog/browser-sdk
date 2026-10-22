import { DeflateEncoderStreamId, addTelemetryDebug, correctedChildSampleRate, display, isSampled } from '@datadog/browser-core'
import type { Encoder, SessionManager } from '@datadog/browser-core'
import { generateUUID, setTimeout } from '@datadog/js-core/util'
import { monitorError } from '@datadog/js-core/monitor'
import { addEventListener, DOM_EVENT } from '@datadog/js-core/dom'
import type { RumConfiguration, TransportPayload, LifeCycle } from '@datadog/browser-rum-core'
import { createFormDataTransport } from '@datadog/browser-rum-core'
import type { WorkerProfilingCommand, WorkerProfilingResponse } from './workerProfiling.types'
import { assembleWorkerProfilingPayload } from './transport/assembleWorkerProfilingPayload'

interface WorkerRegistration {
  worker: Worker
  /** Developer-provided label, used as the `worker.name` tag. Omitted from the profile tags if not provided. */
  name: string | undefined
  /**
   * Stable UUID generated once when the worker is registered.
   * Reused across all collection intervals for this worker instance.
   */
  correlationId: string
  messageListener: (event: MessageEvent) => void
  errorListener: (event: ErrorEvent) => void
  isPaused: boolean
  pendingFlushResolve?: () => void
}

interface WorkerOptions {
  name?: string
}

export interface WorkerProfilingCoordinator {
  attachWorker(worker: Worker, options?: WorkerOptions): () => Promise<void>
  start(sampleIntervalMs: number, maxBufferSize: number, collectIntervalMs: number): void
  stop(): void
  getCorrelationIds(): string[]
}

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
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let stopPageEventListeners: () => void = () => {}

  function attachWorker(worker: Worker, options?: WorkerOptions): () => Promise<void> {
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
      sendCommand(registration, { type: 'dd-detach-profiler' })
      teardownWorker(worker)
    }

    const registration: WorkerRegistration = {
      worker,
      name: options?.name,
      correlationId,
      messageListener,
      errorListener,
      isPaused: false,
    }

    // Safe: Worker.addEventListener is not patched by Zone.js
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    worker.addEventListener('message', messageListener)
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    worker.addEventListener('error', errorListener)
    registrations.set(worker, registration)

    // If profiling is already active, deliver config to this worker immediately
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

    // Hook page-level events so workers are flushed on visibility change / unload,
    // mirroring what datadogProfiler does for the main-thread profiler.
    const { stop: stopVisibility } = addEventListener(window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange)
    const { stop: stopBeforeUnload } = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload)
    stopPageEventListeners = () => {
      stopVisibility()
      stopBeforeUnload()
      stopSessionExpired?.()
      stopSessionRenewed?.()
    }

    // Mirror datadogProfiler's session lifecycle: stop workers on session
    // expiry, restart on renewal only if the new session is still
    // profiling-sampled. Without this, workers keep POSTing profiles across
    // session boundaries, into unsampled sessions.
    const stopSessionExpired = lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
      stop()
    }).unsubscribe

    const stopSessionRenewed = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
      const newSession = session.findTrackedSession()
      if (
        newSession &&
        isSampled(
          newSession.id,
          correctedChildSampleRate(configuration.sessionSampleRate, configuration.profilingSampleRate)
        )
      ) {
        // Re-deliver config to all still-registered workers
        registrations.forEach((registration) => {
          registration.isPaused = false
          sendCommand(registration, {
            type: 'dd-profiling-config',
            ...activeOptions!,
            correlationId: registration.correlationId,
          })
        })
        isPaused = false
      }
    }).unsubscribe

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
      registration.isPaused = true
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
      registration.isPaused = false
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

  function handleWorkerError(registration: WorkerRegistration, error: WorkerProfilingErrorReason): void {
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

  return { attachWorker, start, stop, getCorrelationIds }
}
