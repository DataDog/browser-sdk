import { clockDrift } from '@datadog/js-core/time'
import { buildTags } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { BrowserProfileEvent, BrowserProfilerTrace, RumProfilerVitalEntry, RumViewEntry } from '../../types'

export interface ProfileEventAttributes {
  application: {
    id: string
  }
  session?: {
    id: string
  }
  view?: {
    id: string[]
    name: string[]
  }
  long_task?: {
    id: string[]
  }
  action?: {
    id: string[]
    label: string[]
  }
  vital?: {
    id: string[]
    label: string[]
  }
}

/**
 * Builds a BrowserProfileEvent from a trace.
 */
export function buildProfileEvent(
  profilerTrace: BrowserProfilerTrace,
  configuration: RumConfiguration,
  sessionId: string | undefined
): BrowserProfileEvent {
  const tags = buildTags(configuration) // TODO: get that from the tagContext hook
  const profileAttributes = buildProfileEventAttributes(profilerTrace, configuration.applicationId, sessionId)
  const profileEventTags = buildProfileEventTags(tags)

  return {
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
      clock_drift: clockDrift(),
    },
  }
}

/**
 * Builds attributes for the Profile Event.
 */
export function buildProfileEventAttributes(
  { views, longTasks, actions, vitals }: BrowserProfilerTrace,
  applicationId: string,
  sessionId: string | undefined
): ProfileEventAttributes {
  const longTaskIds = longTasks.map(({ id }) => id).filter((id) => id !== undefined)
  const actionIds = actions?.map(({ id }) => id) ?? []

  return {
    application: { id: applicationId },
    session: sessionId ? { id: sessionId } : undefined,
    view: extractViewAttributes(views),
    long_task: longTaskIds.length ? { id: longTaskIds } : undefined,
    action: actionIds.length ? { id: actionIds, label: [] } : undefined,
    vital: extractVitalAttributes(vitals),
  }
}

// This will be used to filter the profiles by @view.id and/or @view.name.
function extractViewAttributes(views: RumViewEntry[]) {
  if (!views.length) {
    return
  }

  return {
    id: views.map(({ viewId }) => viewId),
    name: Array.from(new Set(views.map(({ viewName }) => viewName).filter((name): name is string => !!name))),
  }
}

function extractVitalAttributes(vitals?: RumProfilerVitalEntry[]) {
  if (!vitals?.length) {
    return
  }

  return {
    id: vitals.map(({ id }) => id),
    label: Array.from(new Set(vitals.map(({ label }) => label))),
  }
}

function buildProfileEventTags(tags: string[]): string[] {
  // Tags already contains the common tags for all events. (service, env, version, etc.)
  // Here we are adding some specific-to-profiling tags.
  return tags.concat(['language:javascript', 'runtime:chrome', 'family:chrome', 'host:browser'])
}
