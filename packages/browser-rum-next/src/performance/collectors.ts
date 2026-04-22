import type { Pipeline } from '@datadog/core-next'
import { startResourceTimingCollection } from './resourceTimingCollector'
import { startLongTaskCollection } from './longTaskCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const stopResources = startResourceTimingCollection(pipeline)
  const stopLongTasks = startLongTaskCollection(pipeline)
  return () => {
    stopResources()
    stopLongTasks()
  }
}

export { startCollectors }
