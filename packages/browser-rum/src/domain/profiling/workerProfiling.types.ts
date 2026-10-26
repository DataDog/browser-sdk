import type { BrowserProfilerTrace } from '../../../types/profiling'

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
      trace: BrowserProfilerTrace
      /** Epoch timestamp (ms) when new Profiler() was created inside the worker */
      startTimeStamp: number
      /** Epoch timestamp (ms) when profiler.stop() resolved */
      endTimeStamp: number
      correlationId: string
    }
  | {
      type: 'dd-worker-error'
      error: 'not-supported-by-browser' | 'failed-to-lazy-load' | 'missing-document-policy-header' | 'unexpected-exception'
      /** Raw exception message when available (for diagnostics). */
      errorMessage?: string
    }


interface WorkerOptions {
  name?: string
}

export interface WorkerProfilingCoordinator {
  attachWorker(worker: Worker, options?: WorkerOptions): () => Promise<void>
  start(sampleIntervalMs: number, maxBufferSize: number, collectIntervalMs: number): void
  stop(): void
  getCorrelationIds(): string[]
  /** Pause all workers — called by datadogProfiler on visibilitychange → hidden. */
  pauseWorkers(): void
  /** Resume all workers — called by datadogProfiler on visibilitychange → visible. */
  resumeWorkers(): void
  /** Flush and restart all workers — called by datadogProfiler on beforeunload. */
  flushAndRestartWorkers(): void
}
