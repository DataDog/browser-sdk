import type { Pipeline } from '@datadog/core-next'
import { startPerformanceCollection } from './performanceCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  return startPerformanceCollection(pipeline)
}

export { startCollectors }
