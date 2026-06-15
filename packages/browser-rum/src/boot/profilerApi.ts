import type { LifeCycle, ViewHistory, RumConfiguration, ProfilerApi, Hooks } from '@datadog/browser-rum-core'
import type { SessionManager, DeflateEncoderStreamId, Encoder } from '@datadog/browser-core'
import { monitorError, correctedChildSampleRate, isSampled, mockable } from '@datadog/browser-core'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'
import { createWorkerProfilingCoordinator } from '../domain/profiling/workerProfilingCoordinator'
import type { WorkerProfilingCoordinator } from '../domain/profiling/workerProfilingCoordinator'
import { DEFAULT_RUM_PROFILER_CONFIGURATION } from '../domain/profiling/datadogProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  let workerCoordinator: WorkerProfilingCoordinator | undefined

  // Buffer addWorker/removeWorker calls that arrive before the coordinator is ready
  // (i.e. before lazyLoadProfiler resolves). Replayed once the coordinator is assigned.
  type PendingCall =
    | { action: 'add'; worker: Worker; options?: { name?: string } }
    | { action: 'remove'; worker: Worker }
  const pendingWorkerCalls: PendingCall[] = []

  function getOrBufferCoordinator() {
    return {
      addWorker(worker: Worker, options?: { name?: string }) {
        if (workerCoordinator) {
          workerCoordinator.addWorker(worker, options)
        } else {
          console.log('[DD ProfilerApi] coordinator not ready yet — buffering addWorker call')
          pendingWorkerCalls.push({ action: 'add', worker, options })
        }
      },
      removeWorker(worker: Worker) {
        if (workerCoordinator) {
          workerCoordinator.removeWorker(worker)
        } else {
          // Remove any buffered add for this worker
          const idx = pendingWorkerCalls.findIndex((c) => c.action === 'add' && c.worker === worker)
          if (idx !== -1) {
            pendingWorkerCalls.splice(idx, 1)
          }
        }
      },
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
    const session = sessionManager.findTrackedSession() // Check if the session is tracked.

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

    workerCoordinator = createWorkerProfilingCoordinator(configuration, lifeCycle, sessionManager, createEncoder)

    lazyLoadProfiler()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          return
        }

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

        workerCoordinator?.start(
          DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs,
          Math.round((DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs * 1.5) / DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs),
          DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs
        )

        // Replay any addWorker/removeWorker calls that arrived before the coordinator was ready
        if (pendingWorkerCalls.length > 0) {
          console.log(`[DD ProfilerApi] replaying ${pendingWorkerCalls.length} buffered worker call(s)`)
          for (const call of pendingWorkerCalls.splice(0)) {
            if (call.action === 'add') {
              workerCoordinator?.addWorker(call.worker, call.options)
            } else {
              workerCoordinator?.removeWorker(call.worker)
            }
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
    getWorkerCoordinator: () => getOrBufferCoordinator(),
  }
}
