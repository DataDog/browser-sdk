import type { RumProfilerTrace, RumViewEntry } from '../types'

export interface ProfileEventAttributes {
  application: { id: string }
  session?: { id: string }
  view?: { id: string[]; name: string[] }
  long_task?: { id: string[] }
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

  // Extract view ids and names from the profiler trace and add them as attributes of the profile event.
  // This will be used to filter the profiles by @view.id and/or @view.name.
  const { ids, names } = extractViewIdsAndNames(profilerTrace.views)

  if (ids.length) {
    attributes.view = {
      id: ids,
      name: names,
    }
  }
  const longTaskIds: string[] = profilerTrace.longTasks.map((longTask) => longTask.id).filter((id) => id !== undefined)

  if (longTaskIds.length) {
    attributes.long_task = { id: longTaskIds }
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
