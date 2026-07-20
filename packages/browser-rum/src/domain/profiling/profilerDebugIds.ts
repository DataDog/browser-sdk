import { buildDebugIdByUrl } from '@datadog/browser-core'
import type { ResourceDebugId } from '../../types'

export function buildProfilerDebugIds(resources: string[]): ResourceDebugId[] | undefined {
  const debugIdByUrl = new Map(buildDebugIdByUrl(resources)?.map((entry) => [entry.url, entry.id]))

  const debugIds: ResourceDebugId[] = []

  resources.forEach((url, resourceId) => {
    const debugId = debugIdByUrl.get(url)
    if (debugId !== undefined) {
      debugIds.push({ resourceId, debugId })
    }
  })

  return debugIds.length ? debugIds : undefined
}
