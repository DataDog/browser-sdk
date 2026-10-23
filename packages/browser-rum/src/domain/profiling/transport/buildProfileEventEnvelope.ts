import { clockDrift } from '@datadog/js-core/time'
import { buildTags } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { BrowserProfileEvent } from '../../../types'

/**
 * Builds the common envelope shared by main-thread and worker profile events.
 * Both event types carry the same intake format (family, runtime, version,
 * attachments, clock_drift) and base profiling tags — only the timestamps,
 * extra attributes (views, long tasks, etc.) and worker-specific tags differ.
 *
 * Extracted from buildProfileEvent.ts and assembleWorkerProfilingPayload.ts
 * to prevent envelope drift (a missing or wrong field in one but not the
 * other is exactly the class of bug that produced the ingestion rejection
 * found during real-world validation — see PROF-15093).
 */
export function buildProfileEventEnvelope(
  configuration: RumConfiguration,
  sessionId: string | undefined,
  start: string,
  end: string,
  extraTags: string[]
): BrowserProfileEvent {
  const tags = buildTags(configuration)
  const profileEventTags = tags.concat(['language:javascript', 'runtime:chrome', 'family:chrome', 'host:browser'])

  for (const tag of extraTags) {
    profileEventTags.push(tag)
  }

  return {
    application: { id: configuration.applicationId },
    ...(sessionId ? { session: { id: sessionId } } : {}),
    attachments: ['wall-time.json'],
    start,
    end,
    family: 'chrome',
    runtime: 'chrome',
    format: 'json',
    version: 4, // Ingestion event version (not the version application tag)
    tags_profiler: profileEventTags.join(','),
    _dd: {
      clock_drift: clockDrift(),
    },
  }
}
