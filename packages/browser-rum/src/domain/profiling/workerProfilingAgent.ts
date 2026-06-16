/**
 * Worker-side shim for Datadog CPU profiling.
 *
 * This file has ZERO dependencies on browser-core, browser-rum-core, or any DOM APIs.
 * It must stay standalone so it can be imported inside a WorkerGlobalScope without
 * pulling in anything that references `window` or `document`.
 *
 * Intentional rule suppressions:
 * - `disallow-zone-js-patched-values`: Zone.js does not run inside workers.
 * - `no-restricted-syntax` (Date.now): browser-core cannot be imported here.
 */
/* eslint-disable local-rules/disallow-zone-js-patched-values */
/* eslint-disable no-restricted-syntax */
import type { ProfilerTrace } from '@datadog/browser-core'
import type { WorkerProfilingCommand, WorkerProfilingResponse } from './workerProfiling.types'

/**
 * Minimal interface that both WorkerGlobalScope and a test double can satisfy.
 */
export interface WorkerScopeForProfiling {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  postMessage(message: WorkerProfilingResponse): void
  Profiler?: new (options: { sampleInterval: number; maxBufferSize: number }) => WorkerProfiler
}

interface WorkerProfiler {
  stop(): Promise<ProfilerTrace>
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

interface ActiveSession {
  profiler: WorkerProfiler
  startTimeStamp: number
  correlationId: string
  sampleIntervalMs: number
  maxBufferSize: number
  collectIntervalMs: number
  timerId: ReturnType<typeof setTimeout>
}

/**
 * Handle returned by attachProfiler().
 */
export interface DatadogWorkerHandle {
  /**
   * Flush the current profiling session — posts the collected trace back to
   * the main thread for upload. Call this before the worker exits so the
   * profile is not lost.
   *
   * Profiling itself stops as a side-effect; the worker lifecycle is entirely
   * your responsibility (call `self.close()` yourself after awaiting detachProfiler).
   *
   * @example
   * const { detachProfiler } = attachProfiler()
   * await doHeavyComputation()
   * await detachProfiler()
   * self.close()
   */
  detachProfiler(): Promise<void>
}

/**
 * Connect this Dedicated Worker to the Datadog profiling pipeline.
 *
 * Sets up a message listener that waits for the coordinator (main thread) to
 * deliver profiling configuration via `dd-profiling-config`. Profiling does
 * not begin until that message is received and `new Profiler()` is called
 * internally — this call itself is non-blocking and has no side-effects beyond
 * installing the listener.
 *
 * Must be paired with `datadogRum.attachProfilingWorker(worker)` on the main thread.
 *
 * @param workerScope - Defaults to `self`. Pass a custom object for testing.
 */
export function attachProfiler(
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  workerScope: WorkerScopeForProfiling = self as unknown as WorkerScopeForProfiling
): DatadogWorkerHandle {
  let session: ActiveSession | undefined

  workerScope.addEventListener('message', (event: MessageEvent) => {
    const command = event.data as WorkerProfilingCommand
    if (!command || typeof command.type !== 'string') {
      return
    }

    if (command.type === 'dd-profiling-config') {
      startSession(command.sampleIntervalMs, command.maxBufferSize, command.collectIntervalMs, command.correlationId)
    } else if (command.type === 'dd-detach-profiler') {
      void flushSession()
    }
  })

  function startSession(
    sampleIntervalMs: number,
    maxBufferSize: number,
    collectIntervalMs: number,
    correlationId: string
  ): void {
    // Flush any existing session before starting a new one
    if (session) {
      void collectAndSend(session)
      session = undefined
    }

    const ProfilerConstructor = workerScope.Profiler
    if (!ProfilerConstructor) {
      workerScope.postMessage({ type: 'dd-worker-error', error: 'not-supported-by-browser' })
      return
    }

    let profiler: WorkerProfiler
    try {
      profiler = new ProfilerConstructor({ sampleInterval: sampleIntervalMs, maxBufferSize })
    } catch (e) {
      const isDocPolicyError =
        e instanceof Error && (e.name === 'NotAllowedError' || e.message.includes('disabled by Document Policy'))
      workerScope.postMessage({
        type: 'dd-worker-error',
        error: isDocPolicyError ? 'missing-document-policy-header' : 'unexpected-exception',
      })
      return
    }

    const timerId = setTimeout(() => {
      void collectAndRestart()
    }, collectIntervalMs)

    session = {
      profiler,
      startTimeStamp: Date.now(),
      correlationId,
      sampleIntervalMs,
      maxBufferSize,
      collectIntervalMs,
      timerId,
    }

    profiler.addEventListener('samplebufferfull', handleBufferFull)
  }

  function handleBufferFull(): void {
    void collectAndRestart()
  }

  async function collectAndRestart(): Promise<void> {
    if (!session) {
      return
    }
    const currentSession = session
    session = undefined
    await collectAndSend(currentSession)
    startSession(
      currentSession.sampleIntervalMs,
      currentSession.maxBufferSize,
      currentSession.collectIntervalMs,
      currentSession.correlationId
    )
  }

  async function flushSession(): Promise<void> {
    if (!session) {
      return
    }
    const currentSession = session
    session = undefined
    await collectAndSend(currentSession)
  }

  async function collectAndSend(activeSession: ActiveSession): Promise<void> {
    clearTimeout(activeSession.timerId)
    activeSession.profiler.removeEventListener('samplebufferfull', handleBufferFull)

    const startTimeStamp = activeSession.startTimeStamp
    const correlationId = activeSession.correlationId

    try {
      const trace = await activeSession.profiler.stop()
      const endTimeStamp = Date.now()
      workerScope.postMessage({
        type: 'dd-worker-trace',
        trace,
        startTimeStamp,
        endTimeStamp,
        correlationId,
      })
    } catch {
      workerScope.postMessage({ type: 'dd-worker-error', error: 'unexpected-exception' })
    }
  }

  return { detachProfiler: flushSession }
}
