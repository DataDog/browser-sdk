import type { Pipeline } from '@datadog/core-next'
import type { ResourceTimingEntry } from './types'

function startResourceTimingCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {}
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      pipeline.publish('resource:performance_entry', entry as unknown as ResourceTimingEntry)
    }
  })

  observer.observe({ type: 'resource', buffered: true })

  return () => {
    observer.disconnect()
  }
}

export { startResourceTimingCollection }
