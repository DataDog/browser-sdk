import { getSourceCodeContext } from '@datadog/browser-core'
import type { ResourceDebugId } from '../../types'

export function buildProfilerDebugIds(resources: string[]): ResourceDebugId[] | undefined {
  const debugIds: ResourceDebugId[] = []

  resources.forEach((url, resourceId) => {
    const debugId = getSourceCodeContext(url)?.ddDebugId
    if (debugId !== undefined) {
      debugIds.push({ resourceId, debugId })
    }
  })

  return debugIds.length ? debugIds : undefined
}
