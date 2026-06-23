import { clockDrift } from '@openobserve/js-core/time'
import { buildTags } from '@openobserve/browser-core'
import type { RumConfiguration } from '@openobserve/browser-rum-core'
import type { BrowserProfileEvent, BrowserProfilerTrace, RumProfilerVitalEntry, RumViewEntry } from '../../../types'

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
    _oo: {
      clock_drift: clockDrift(),
    },
  }
}

/**
 * Builds attributes for the Profile Event.
 *
 * @param profilerTrace - Profiler trace
 * @param applicationId - application id.
 * @param sessionId - session id.
 * @returns Additional attributes.
 */
export function buildProfileEventAttributes(
  profilerTrace: BrowserProfilerTrace,
  applicationId: string,
  sessionId: string | undefined
): ProfileEventAttributes {
  // Extract view ids and names from the profiler trace and add them as attributes of the profile event.
  // This will be used to filter the profiles by @view.id and/or @view.name.
  const { ids, names } = extractViewIdsAndNames(profilerTrace.views)

  const longTaskIds: string[] = profilerTrace.longTasks.map((longTask) => longTask.id).filter((id) => id !== undefined)

  const actionIds: string[] =
    profilerTrace.actions?.map((longTask) => longTask.id).filter((id) => id !== undefined) ?? []

  const { ids: vitalIds, labels: vitalLabels } = extractVitalIdsAndLabels(profilerTrace.vitals)

  const attributes: ProfileEventAttributes = { application: { id: applicationId } }

  if (sessionId) {
    attributes.session = { id: sessionId }
  }
  if (ids.length) {
    attributes.view = { id: ids, name: names }
  }
  if (longTaskIds.length) {
    attributes.long_task = { id: longTaskIds }
  }
  if (actionIds.length) {
    attributes.action = { id: actionIds, label: [] }
  }
  if (vitalIds.length) {
    attributes.vital = { id: vitalIds, label: vitalLabels }
  }
  return attributes
}

function extractViewIdsAndNames(views: RumViewEntry[]): { ids: string[]; names: string[] } {
  const result: { ids: string[]; names: string[] } = { ids: [], names: [] }
  for (const view of views) {
    result.ids.push(view.viewId)

    if (view.viewName) {
      result.names.push(view.viewName)
    }
  }

  // Remove duplicates
  result.names = Array.from(new Set(result.names))

  return result
}

function extractVitalIdsAndLabels(vitals?: RumProfilerVitalEntry[]): {
  ids: string[]
  labels: string[]
} {
  const result: { ids: string[]; labels: string[] } = { ids: [], labels: [] }

  if (!vitals) {
    return result
  }

  for (const vital of vitals) {
    result.ids.push(vital.id)
    result.labels.push(vital.label)
  }

  // Remove duplicates
  result.labels = Array.from(new Set(result.labels))

  return result
}

function buildProfileEventTags(tags: string[]): string[] {
  // Tags already contains the common tags for all events. (service, env, version, etc.)
  // Here we are adding some specific-to-profiling tags.
  return tags.concat(['language:javascript', 'runtime:chrome', 'family:chrome', 'host:browser'])
}
