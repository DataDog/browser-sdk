import type { Payload } from '@datadog/browser-core'
import { addTelemetryDebug, buildTags, currentDrift } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { RumProfilerTrace } from '../types'
import type { ProfileEventAttributes } from './buildProfileEventAttributes'
import { buildProfileEventAttributes } from './buildProfileEventAttributes'

interface ProfileEvent extends ProfileEventAttributes {
  attachments: string[]
  start: string // ISO date
  end: string // ISO date
  family: 'chrome'
  runtime: 'chrome'
  format: 'json'
  version: 4
  tags_profiler: string
  _dd: {
    clock_drift: number
  }
}

export type SendProfileFunction = (
  trace: RumProfilerTrace,
  configuration: RumConfiguration,
  sessionId: string | undefined
) => Promise<unknown>

/**
 * Send RUM profile as JSON to public profiling intake.
 */
const sendProfile: SendProfileFunction = (profilerTrace, configuration, sessionId) => {
  const { profilingEndpointBuilder: endpointBuilder, applicationId } = configuration
  const event = buildProfileEvent(profilerTrace, configuration, sessionId)
  const payload = buildProfilingPayload(profilerTrace, event)

  // Create URL, public profiling intake.
  const profilingIntakeURL = endpointBuilder.build('fetch', payload)

  // monitor-until: 2025-01-01, reconsider after profiling GA
  addTelemetryDebug('Sending profile to public profiling intake', { profilingIntakeURL, applicationId, sessionId })

  // Send payload (event + profile as attachment).
  return fetch(profilingIntakeURL, {
    body: payload.data,
    method: 'POST',
  })
}

function buildProfileEvent(
  profilerTrace: RumProfilerTrace,
  configuration: RumConfiguration,
  sessionId: string | undefined
): ProfileEvent {
  const tags = buildTags(configuration) // TODO: get that from the tagContext hook
  const profileAttributes = buildProfileEventAttributes(profilerTrace, configuration.applicationId, sessionId)
  const profileEventTags = buildProfileEventTags(tags)

  const profileEvent: ProfileEvent = {
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

/**
 * Builds payload for Profiling intake. It includes the profile event and the profiler trace as attachment.
 *
 * @param profilerTrace - Profiler trace
 * @param profileEvent - Profiling event.
 * @returns Payload to be sent to the intake.
 */
function buildProfilingPayload(profilerTrace: RumProfilerTrace, profileEvent: ProfileEvent): Payload {
  const profilerTraceBlob = new Blob([JSON.stringify(profilerTrace)], {
    type: 'application/json',
  })
  const formData = new FormData()
  formData.append('event', new Blob([JSON.stringify(profileEvent)], { type: 'application/json' }), 'event.json')
  formData.append('wall-time.json', profilerTraceBlob, 'wall-time.json')

  return { data: formData, bytesCount: 0 }
}

export const transport = {
  sendProfile,
}
