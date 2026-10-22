import type { ProfilerTrace } from '@datadog/js-core/util'

/**
 * Clock object expected by the profiling backend (same shape as js-core's
 * ClocksState): a performance.now()-relative time plus its epoch timestamp.
 */
export interface WorkerProfilerClocks {
  /** Time (ms) relative to the worker's time origin. */
  relative: number
  /** Epoch timestamp (ms). */
  timeStamp: number
}

/**
 * Raw ProfilerTrace from `profiler.stop()`, enriched with the fields required
 * by the profiling backend's ChromeJsonParser (all `required = true`):
 * sampleInterval, startClocks, endClocks, clocksOrigin, longTasks and views.
 *
 * Sample timestamps produced by the worker Profiler are relative to the
 * WORKER's time origin (not the page's) — the backend computes absolute
 * sample times as `sample.timestamp + clocksOrigin.timeStamp`, so
 * clocksOrigin must carry the worker's `performance.timeOrigin`.
 */
export interface EnrichedWorkerProfilerTrace extends ProfilerTrace {
  /** Actual sampling interval in ms (from the Profiler instance). */
  sampleInterval: number
  startClocks: WorkerProfilerClocks
  endClocks: WorkerProfilerClocks
  /** The worker's time origin: `{ relative: 0, timeStamp: performance.timeOrigin }`. */
  clocksOrigin: WorkerProfilerClocks
  /** Workers have no view / long-task context. */
  longTasks: []
  views: []
}

export type WorkerProfilingCommand =
  | {
      /**
       * Sent by the coordinator once a profiling session is active.
       * Delivers the configuration the worker needs to instantiate its Profiler.
       * This is not a "start" command — profiling begins inside the worker
       * only after receiving this and calling `new Profiler()`.
       */
      type: 'dd-profiling-config'
      sampleIntervalMs: number
      maxBufferSize: number
      collectIntervalMs: number
      /**
       * Stable UUID assigned to this worker at attach time.
       * Reused across all collection intervals for this worker instance.
       */
      correlationId: string
    }
  | {
      /**
       * Sent by the coordinator when the worker is being detached from the
       * profiling pipeline. The worker should flush its current session.
       */
      type: 'dd-detach-profiler'
    }

export type WorkerProfilingResponse =
  | {
      type: 'dd-worker-trace'
      trace: EnrichedWorkerProfilerTrace
      /** Epoch timestamp (ms) when new Profiler() was created inside the worker */
      startTimeStamp: number
      /** Epoch timestamp (ms) when profiler.stop() resolved */
      endTimeStamp: number
      correlationId: string
    }
  | {
      type: 'dd-worker-error'
      error: WorkerProfilingErrorReason
      /** Raw exception message when available (for diagnostics). */
      errorMessage?: string
    }

export type WorkerProfilingErrorReason =
  | 'not-supported-by-browser' // Profiler not in WorkerGlobalScope
  | 'missing-document-policy-header' // NotAllowedError on new Profiler()
  | 'unexpected-exception' // Any other error
