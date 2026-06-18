import type { LifeCycle, ViewHistory, RumConfiguration, ProfilerApi, Hooks } from '@datadog/browser-rum-core'
import type { SessionManager, DeflateEncoderStreamId, Encoder } from '@datadog/browser-core'
import { monitorError, correctedChildSampleRate, isSampled, mockable } from '@datadog/browser-core'
import type { WorkerProfilingCoordinator } from '../domain/profiling/workerProfilingCoordinator'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  let workerCoordinator: WorkerProfilingCoordinator | undefined

  // Buffer attachWorker calls that arrive before the coordinator is ready
  // (i.e. before lazyLoadProfiler resolves). Replayed once the coordinator is assigned.
  interface PendingCall {
    worker: Worker
    options?: { name?: string }
    resolve: (detach: () => void) => void
  }
  const pendingWorkerCalls: PendingCall[] = []

  function attachWorker(worker: Worker, options?: { name?: string }): () => void {
    if (workerCoordinator) {
      return workerCoordinator.attachWorker(worker, options)
    }

    // Coordinator not ready yet — buffer the call and return a detach function
    // that either cancels the buffered call or delegates to the coordinator once ready.
    let detachFromCoordinator: (() => void) | undefined
    const pending: PendingCall = {
      worker,
      options,
      resolve: (detach) => {
        detachFromCoordinator = detach
      },
    }
    pendingWorkerCalls.push(pending)

    return () => {
      if (detachFromCoordinator) {
        // Coordinator has since resolved — delegate to its detach
        detachFromCoordinator()
      } else {
        // Still buffered — cancel it
        const idx = pendingWorkerCalls.indexOf(pending)
        if (idx !== -1) {
          pendingWorkerCalls.splice(idx, 1)
        }
      }
    }
  }

  function onRumStart(
    lifeCycle: LifeCycle,
    hooks: Hooks,
    configuration: RumConfiguration,
    sessionManager: SessionManager,
    viewHistory: ViewHistory,
    createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
  ) {
    const session = sessionManager.findTrackedSession()

    if (!session) {
      // No session tracked, no profiling.
      // Note: No Profiling context is set at this stage.
      return
    }

    // Sampling (sticky sampling based on session id)
    if (
      !isSampled(
        session.id,
        correctedChildSampleRate(configuration.sessionSampleRate, configuration.profilingSampleRate)
      )
    ) {
      // No sampling, no profiling.
      // Note: No Profiling context is set at this stage.
      return
    }

    // Listen to events and add the profiling context to them.
    const profilingContextManager = startProfilingContext(hooks)

    // Browser support check
    if (!mockable(isProfilingSupported)()) {
      profilingContextManager.set({
        status: 'error',
        error_reason: 'not-supported-by-browser',
      })
      return
    }

    lazyLoadProfiler()
      .then((module) => {
        if (!module) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          return
        }

        const { createRumProfiler, createWorkerProfilingCoordinator, DEFAULT_RUM_PROFILER_CONFIGURATION } = module

        workerCoordinator = createWorkerProfilingCoordinator(configuration, lifeCycle, sessionManager, createEncoder)

        profiler = createRumProfiler(
          configuration,
          lifeCycle,
          sessionManager,
          profilingContextManager,
          createEncoder,
          viewHistory,
          undefined,
          () => workerCoordinator?.getCorrelationIds() ?? []
        )
        profiler.start()

        workerCoordinator.start(
          DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs,
          Math.round(
            (DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs * 1.5) /
              DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs
          ),
          DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs
        )

        // Replay any attachWorker calls that arrived before the coordinator was ready
        if (pendingWorkerCalls.length > 0) {
          for (const call of pendingWorkerCalls.splice(0)) {
            const detach = workerCoordinator.attachWorker(call.worker, call.options)
            call.resolve(detach)
          }
        }
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop()
      workerCoordinator?.stop()
    },
    getWorkerCoordinator: () => ({ attachWorker }),
  }
}
