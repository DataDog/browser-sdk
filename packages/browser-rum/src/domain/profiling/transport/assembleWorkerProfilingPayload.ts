import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { ProfilerTrace } from '@datadog/js-core/util'
import type { BrowserProfileEvent } from '../../../types'
import { buildProfileEventEnvelope } from './buildProfileEventEnvelope'

export interface WorkerProfileEventPayload {
  event: BrowserProfileEvent
  'wall-time.json': ProfilerTrace
}

/**
 * Assembles the intake payload for a worker profile trace.
 * Similar to assembleProfilingPayload but without view/longTask/vital/action context,
 * and with worker-specific tags (thread:worker, worker.name, thread.correlation_id).
 */
export function assembleWorkerProfilingPayload(
  trace: ProfilerTrace,
  startTimeStamp: number,
  endTimeStamp: number,
  correlationId: string,
  workerName: string | undefined,
  configuration: RumConfiguration,
  sessionId: string | undefined
): WorkerProfileEventPayload {
  const workerTags = ['thread:worker', `thread.correlation_id:${correlationId}`].concat(
    workerName ? [`worker.name:${workerName}`] : []
  )
  const event = buildProfileEventEnvelope(
    configuration,
    sessionId,
    new Date(startTimeStamp).toISOString(),
    new Date(endTimeStamp).toISOString(),
    workerTags
  )

  return {
    event,
    'wall-time.json': trace,
  }
}


