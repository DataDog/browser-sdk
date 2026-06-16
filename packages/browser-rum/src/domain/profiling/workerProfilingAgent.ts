/**
 * Worker-side shim for Datadog CPU profiling.
 *
 * This file has ZERO dependencies on browser-core, browser-rum-core, or any DOM APIs.
 * It must stay standalone so it can be imported inside a WorkerGlobalScope without
 * pulling in anything that references `window` or `document`.
 */
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
  stop(): Promise<object>
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
 * Handle returned by startProfilingWorker().
 */
export interface DatadogWorkerHandle {
  /**
   * Flush the current profiling session.
   *
   * Call this when the worker is done with its work, before the worker exits.
   * The profile is posted back to the main thread for upload.
   *
   * For Pattern B (self-managed lifecycle), call `stop()` then let the worker
   * exit naturally (via `self.close()` or by returning from its top-level code).
   *
   * @example
   * const stop = startProfilingWorker()
   * await doHeavyComputation()
   * await stop()
   * self.close()
   */
  stop(): Promise<void>
}

/**
 * Call this once inside your Dedicated Worker to enable Datadog CPU profiling.
 * Must be paired with `datadogRum.registerProfilingWorker(worker)` on the main thread.
 *
 * @param workerScope - Defaults to `self`. Pass a custom object for testing.
 */
export function startProfilingWorker(
  workerScope: WorkerScopeForProfiling = self as unknown as WorkerScopeForProfiling
): DatadogWorkerHandle {
  let session: ActiveSession | undefined

  console.log('[DD Worker] startProfilingWorker() called — waiting for dd-start-profiling')

  workerScope.addEventListener('message', (event: MessageEvent) => {
    const command = event.data as WorkerProfilingCommand
    if (!command || typeof command.type !== 'string') {
      return
    }

    console.log('[DD Worker] received command:', command.type)

    if (command.type === 'dd-start-profiling') {
      startSession(command.sampleIntervalMs, command.maxBufferSize, command.collectIntervalMs, command.correlationId)
    } else if (command.type === 'dd-stop-profiling') {
      void stopSession()
    }
  })

  function startSession(
    sampleIntervalMs: number,
    maxBufferSize: number,
    collectIntervalMs: number,
    correlationId: string
  ): void {
    // Stop any existing session before starting a new one
    if (session) {
      void collectAndSend(session)
      session = undefined
    }

    const ProfilerConstructor = workerScope.Profiler
    if (!ProfilerConstructor) {
      console.warn('[DD Worker] Profiler API not available in this scope — missing flag or wrong browser')
      workerScope.postMessage({ type: 'dd-worker-error', error: 'not-supported-by-browser' })
      return
    }

    let profiler: WorkerProfiler
    try {
      profiler = new ProfilerConstructor({ sampleInterval: sampleIntervalMs, maxBufferSize })
      console.log(
        `[DD Worker] Profiler started — sampleInterval=${sampleIntervalMs}ms maxBufferSize=${maxBufferSize} collectInterval=${collectIntervalMs}ms correlationId=${correlationId}`
      )
    } catch (e) {
      const isDocPolicyError =
        e instanceof Error &&
        (e.name === 'NotAllowedError' || e.message.includes('disabled by Document Policy'))
      console.error('[DD Worker] Failed to construct Profiler:', e)
      workerScope.postMessage({
        type: 'dd-worker-error',
        error: isDocPolicyError ? 'missing-document-policy-header' : 'unexpected-exception',
      })
      return
    }

    const timerId = setTimeout(() => {
      console.log(`[DD Worker] collectInterval (${collectIntervalMs}ms) elapsed — collecting and restarting`)
      void collectAndRestart()
    }, collectIntervalMs)
    console.log(`[DD Worker] collection timer set for ${collectIntervalMs}ms`)

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
    console.log('[DD Worker] samplebufferfull — collecting early and restarting')
    void collectAndRestart()
  }

  async function collectAndRestart(): Promise<void> {
    if (!session) {
      return
    }
    const currentSession = session
    session = undefined
    console.log(
      `[DD Worker] collectAndRestart — collecting trace for correlationId=${currentSession.correlationId}`
    )
    await collectAndSend(currentSession)
    console.log('[DD Worker] restarting profiler after collect')
    startSession(
      currentSession.sampleIntervalMs,
      currentSession.maxBufferSize,
      currentSession.collectIntervalMs,
      currentSession.correlationId
    )
  }

  async function stopSession(): Promise<void> {
    if (!session) {
      console.log('[DD Worker] stopSession called but no active session')
      return
    }
    const currentSession = session
    session = undefined
    console.log(
      `[DD Worker] stopSession — collecting final trace for correlationId=${currentSession.correlationId}`
    )
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
      const durationMs = endTimeStamp - startTimeStamp
      console.log(
        `[DD Worker] profiler.stop() resolved — durationMs=${durationMs} correlationId=${correlationId} — posting dd-worker-trace`
      )
      workerScope.postMessage({
        type: 'dd-worker-trace',
        trace: trace as any,
        startTimeStamp,
        endTimeStamp,
        correlationId,
      })
    } catch (e) {
      console.error('[DD Worker] profiler.stop() threw:', e)
      workerScope.postMessage({ type: 'dd-worker-error', error: 'unexpected-exception' })
    }
  }

  return { stop: stopSession }
}
