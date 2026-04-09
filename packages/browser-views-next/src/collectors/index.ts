import type { Pipeline } from '@datadog/core-next'
import { startInitialViewCollection } from '../initialViewCollector'
import { startNavigationCollection } from '../navigationCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  startInitialViewCollection(pipeline)
  const stopNavigation = startNavigationCollection(pipeline)
  return stopNavigation
}

export { startCollectors }
