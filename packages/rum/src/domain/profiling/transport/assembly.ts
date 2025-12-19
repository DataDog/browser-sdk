import { buildTags, currentDrift } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { ProfileEventPayload as GeneratedProfileEventPayload, RumProfilerTrace} from '../../../types'
import { buildProfileEventAttributes } from './buildProfileEventAttributes'

export interface ProfileEventPayload {
  event: GeneratedProfileEventPayload['event']
  'wall-time.json': RumProfilerTrace
}

export function assembleProfilingPayload(
  profilerTrace: RumProfilerTrace,
  configuration: RumConfiguration,
  sessionId: string | undefined
): ProfileEventPayload {
  const event = buildProfileEvent(profilerTrace, configuration, sessionId)

  return {
    event,
    'wall-time.json': profilerTrace,
  }
}

function buildProfileEvent(
  profilerTrace: RumProfilerTrace,
  configuration: RumConfiguration,
  sessionId: string | undefined
): ProfileEventPayload['event'] {
  const tags = buildTags(configuration) // TODO: get that from the tagContext hook
  const profileAttributes = buildProfileEventAttributes(profilerTrace, configuration.applicationId, sessionId)
  const profileEventTags = buildProfileEventTags(tags)

  const profileEvent: ProfileEventPayload['event'] = {
    ...profileAttributes,
    attachments: ['wall-time.json'],
    start: new Date(profilerTrace.startClocks.timeStamp).toISOString(),
    end: new Date(profilerTrace.endClocks.timeStamp).toISOString(),
    family: 'chrome',
    runtime: 'chrome',
    format: 'json',
    version: 4, // Ingestion event version (not the version application tag)
    tags_profiler: profileEventTags.join(','),
    _dd: {
      clock_drift: currentDrift(),
    },
  }

  return profileEvent
}

/**
 * Builds tags for the Profile Event.
 *
 * @param tags - RUM tags
 * @returns Combined tags for the Profile Event.
 */
function buildProfileEventTags(tags: string[]): string[] {
  // Tags already contains the common tags for all events. (service, env, version, etc.)
  // Here we are adding some specific-to-profiling tags.
  const profileEventTags = tags.concat(['language:javascript', 'runtime:chrome', 'family:chrome', 'host:browser'])

  return profileEventTags
}
