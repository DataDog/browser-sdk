import {
  addTelemetryDebug,
  currentDrift,
  relativeToClocks,
  type EndpointBuilder,
  type Payload,
} from '@datadog/browser-core'
import type { RumProfilerTrace } from '../types'
import { getLongTaskId } from '../utils/longTaskRegistry'

interface ProfileEventAttributes {
  application: { id: string }
  session?: { id: string }
  view?: { id: string[] }
  long_task?: { id: string[] }
}
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

  const profilerStartClocks = relativeToClocks(profilerTrace.startTime)
  const profilerEndClocks = relativeToClocks(profilerTrace.endTime)

  const profileEvent: ProfileEvent = {
    ...profileAttributes,
    attachments: ['wall-time.json'],
    start: new Date(profilerStartClocks.timeStamp).toISOString(),
    end: new Date(profilerEndClocks.timeStamp).toISOString(),
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
 * @param tags RUM tags
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
      id: viewIds,
    }
  }
  const longTaskIds: string[] = profilerTrace.longTasks
    .map((longTask) => getLongTaskId(longTask))
    .filter((id) => id !== undefined)

  if (longTaskIds.length) {
    attributes.long_task = { id: longTaskIds }
  }
  return attributes
}

export const transport = {
  sendProfile,
}
