import { clockDrift } from '@datadog/js-core/time'
import { buildTags } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { ProfilerTrace } from '@datadog/browser-core'
import type { BrowserProfileEvent } from '../../../types'

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
  const tags = buildTags(configuration)
  const profileEventTags = buildWorkerProfileEventTags(tags, correlationId, workerName)

  const event: BrowserProfileEvent = {
    application: { id: configuration.applicationId },
    ...(sessionId ? { session: { id: sessionId } } : {}),
    attachments: ['wall-time.json'],
    start: new Date(startTimeStamp).toISOString(),
    end: new Date(endTimeStamp).toISOString(),
    family: 'chrome',
    runtime: 'chrome',
    format: 'json',
    version: 4,
    tags_profiler: profileEventTags.join(','),
    _dd: {
      clock_drift: clockDrift(),
    },
  }

  return {
    event,
    'wall-time.json': trace,
  }
}

function buildWorkerProfileEventTags(tags: string[], correlationId: string, workerName: string | undefined): string[] {
  const profileEventTags = tags.concat([
    'language:javascript',
    'runtime:chrome',
    'family:chrome',
    'host:browser',
    'thread:worker',
    `thread.correlation_id:${correlationId}`,
  ])

  if (workerName) {
    profileEventTags.push(`worker.name:${workerName}`)
  }

  return profileEventTags
}
