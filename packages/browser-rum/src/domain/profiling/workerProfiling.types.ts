import type { ProfilerTrace } from '@datadog/browser-core'

export type WorkerProfilingCommand =
  | {
      type: 'dd-start-profiling'
      sampleIntervalMs: number
      maxBufferSize: number
      collectIntervalMs: number
      /**
       * Stable UUID assigned to this worker at registration time.
       * Reused across all collection intervals for this worker instance.
       */
      correlationId: string
    }
  | {
      type: 'dd-stop-profiling'
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
