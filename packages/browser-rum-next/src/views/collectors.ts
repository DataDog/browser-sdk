import type { Pipeline } from '@datadog/core-next'
import { startInitialViewCollection } from './initialViewCollector'
import { startNavigationCollection } from './navigationCollector'

function startViewCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const stopInitial = startInitialViewCollection(pipeline)
  const stopNavigation = startNavigationCollection(pipeline)
  return () => {
    stopInitial()
    stopNavigation()
  }
}

export { startViewCollectors }
