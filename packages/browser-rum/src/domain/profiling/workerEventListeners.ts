import { addEventListener } from '@datadog/js-core/dom'
import type { WorkerProfilingResponse } from './workerProfiling.types'

/**
 * Internal registration state for a worker attached to the profiling pipeline.
 * Kept alongside the event listener stop functions so the coordinator can tear
 * everything down cleanly.
 */
export interface WorkerRegistration {
  worker: Worker
  /** Developer-provided label, used as the `worker.name` tag. Omitted from the profile tags if not provided. */
  name: string | undefined
  /**
   * Stable UUID generated once when the worker is registered.
   * Reused across all collection intervals for this worker instance.
   */
  correlationId: string
  stopMessageListener: () => void
  stopErrorListener: () => void
  isPaused: boolean
  pendingFlushResolve?: () => void
}

/**
 * Sets up event listeners on a Worker for the profiling pipeline.
 *
 * Isolated in its own module because the `addEventListener` helper's
 * `EventMapFor<Worker>` conditional generic is too complex for the ESLint
 * TypeScript parser to resolve when it appears in the same file as the
 * coordinator — it cascades as `no-unsafe-call` on every method call in
 * files that import the coordinator's return type. Keeping the generics
 * here means the coordinator file has only simple types the parser can
 * resolve.
 */
export function addWorkerEventListeners(
  worker: Worker,
  handlers: {
    onTrace: (response: Extract<WorkerProfilingResponse, { type: 'dd-worker-trace' }>) => void
    onError: (error: string) => void
    onWorkerCrash: (message: string) => void
  }
): { stopMessageListener: () => void; stopErrorListener: () => void } {
  const { stop: stopMessageListener } = addEventListener(worker, 'message', (event) => {
    const response = event.data as WorkerProfilingResponse
    if (!response || typeof response.type !== 'string') {
      return
    }
    if (response.type === 'dd-worker-trace') {
      handlers.onTrace(response)
    } else if (response.type === 'dd-worker-error') {
      handlers.onError(response.error)
    }
  })

  const { stop: stopErrorListener } = addEventListener(worker, 'error', (event) => {
    handlers.onWorkerCrash(event.message)
  })

  return { stopMessageListener, stopErrorListener }
}
