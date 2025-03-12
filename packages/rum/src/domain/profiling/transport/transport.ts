import { addTelemetryDebug, type EndpointBuilder, type Payload } from '@datadog/browser-core'
import type { RumProfilerTrace } from '../types'
import { getLongTaskId } from '../utils/longTaskRegistry'

interface ProfileEventAttributes {
  application: { id: string }
  session?: { id: string }
  view?: { ids: string[] }
  context?: { long_task: { id: string[] } }
}
interface ProfileEvent extends ProfileEventAttributes {
  attachments: string[]
  start: string // ISO date
  end: string // ISO date
  family: 'chrome'
  tags_profiler: string
}

type SendProfileFunction = (
  trace: RumProfilerTrace,
  endpointBuilder: EndpointBuilder,
  applicationId: string,
  sessionId: string | undefined
) => Promise<unknown>

/**
 * Send RUM profile as JSON to public profiling intake.
 */
const sendProfile: SendProfileFunction = (profilerTrace, endpointBuilder, applicationId, sessionId) => {
  const event = buildProfileEvent(profilerTrace, endpointBuilder, applicationId, sessionId)
  const payload = buildProfilingPayload(profilerTrace, event)

  // Create URL, public profiling intake.
  const profilingIntakeURL = endpointBuilder.build('fetch', payload)

  addTelemetryDebug('Sending profile to public profiling intake', { profilingIntakeURL, applicationId, sessionId })

  // Send payload (event + profile as attachment).
  return fetch(profilingIntakeURL, {
    body: payload.data,
    method: 'POST',
  })
}

function buildProfileEvent(
  profilerTrace: RumProfilerTrace,
  endpointBuilder: EndpointBuilder,
  applicationId: string,
  sessionId: string | undefined
): ProfileEvent {
  const tags = endpointBuilder.tags
  const profileAttributes = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)
  const profileEventTags = buildProfileEventTags(tags)

  const start = new Date(profilerTrace.timeOrigin + profilerTrace.startTime)
  const end = new Date(profilerTrace.timeOrigin + profilerTrace.endTime)

  const profileEvent: ProfileEvent = {
    ...profileAttributes,
    attachments: ['wall-time.json'],
    start: start.toISOString(),
    end: end.toISOString(),
    family: 'chrome',
    tags_profiler: profileEventTags.join(','),
  }

  return profileEvent
}

/**
 * Builds tags for the Profile Event.
 * @param tags RUM tags
 * @returns Combined tags for the Profile Event.
 */
function buildProfileEventTags(tags: string[]): string[] {
  // Tags already contains the common tags for all events. (service, env, version, etc.)
  // Here we are adding some specific-to-profiling tags.
  const profileEventTags = tags.concat([
    'language:javascript',
    'runtime:chrome',
    'family:chrome',
    'format:json',
    'host:browser',
  ])

  return profileEventTags
}

/**
 * Builds payload for Profiling intake. It includes the profile event and the profiler trace as attachment.
 * @param profilerTrace Profiler trace
 * @param profileEvent Profiling event.
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

/**
 * Builds attributes for the Profile Event.
 * @param profilerTrace Profiler trace
 * @param applicationId application id.
 * @param sessionId session id.
 * @returns Additional attributes.
 */
function buildProfileEventAttributes(
  profilerTrace: RumProfilerTrace,
  applicationId: string,
  sessionId: string | undefined
): ProfileEventAttributes {
  const attributes: ProfileEventAttributes = {
    application: {
      id: applicationId,
    },
  }
  if (sessionId) {
    attributes.session = {
      id: sessionId,
    }
  }
  const viewIds = Array.from(new Set(profilerTrace.views.map((viewEntry) => viewEntry.viewId)))
  if (viewIds.length) {
    attributes.view = {
      ids: viewIds,
    }
  }
  const longTaskIds: string[] = profilerTrace.longTasks
    .map((longTask) => getLongTaskId(longTask))
    .filter((id) => id !== undefined)

  if (longTaskIds.length) {
    attributes.context = {
      long_task: { id: longTaskIds },
    }
  }
  return attributes
}

export const transport = {
  sendProfile,
}
