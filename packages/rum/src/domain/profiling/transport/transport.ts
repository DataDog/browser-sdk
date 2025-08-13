import type { Context } from '@datadog/browser-core'
import { buildTags, currentDrift } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { RumProfilerTrace } from '../types'

interface ProfileEventAttributes {
  application: { id: string }
  session?: { id: string }
  view?: { id: string[] }
  long_task?: { id: string[] }
}

export interface ProfileEvent extends ProfileEventAttributes {
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

export type AssembleProfilingPayloadFunction = (
  trace: RumProfilerTrace,
  configuration: RumConfiguration,
  sessionId: string | undefined
) => {
  event: ProfileEvent
  attachements: Record<string, Context>
}

const assembleProfilingPayload: AssembleProfilingPayloadFunction = (profilerTrace, configuration, sessionId) => {
  const event = buildProfileEvent(profilerTrace, configuration, sessionId)

  return {
    event,
    attachements: { 'wall-time.json': profilerTrace as unknown as Context },
  }
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
 * Builds attributes for the Profile Event.
 *
 * @param profilerTrace - Profiler trace
 * @param applicationId - application id.
 * @param sessionId - session id.
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
  const longTaskIds: string[] = profilerTrace.longTasks.map((longTask) => longTask.id).filter((id) => id !== undefined)

  if (longTaskIds.length) {
    attributes.long_task = { id: longTaskIds }
  }
  return attributes
}

export const transport = {
  assembleProfilingPayload,
}
