import type { ProfilerTrace } from '@datadog/browser-core'

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
      trace: ProfilerTrace
      /** Epoch timestamp (ms) when new Profiler() was created inside the worker */
      startTimeStamp: number
      /** Epoch timestamp (ms) when profiler.stop() resolved */
      endTimeStamp: number
      correlationId: string
    }
  | {
      type: 'dd-worker-error'
      error: WorkerProfilingErrorReason
    }

export type WorkerProfilingErrorReason =
  | 'not-supported-by-browser' // Profiler not in WorkerGlobalScope
  | 'missing-document-policy-header' // NotAllowedError on new Profiler()
  | 'unexpected-exception' // Any other error
