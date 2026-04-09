import type { Pipeline } from '@datadog/core-next'
import { startXhrCollection } from '../xhrCollector'
import { startFetchCollection } from '../fetchCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const stopXhr = startXhrCollection(pipeline)
  const stopFetch = startFetchCollection(pipeline)
  return () => {
    stopXhr()
    stopFetch()
  }
}

export { startCollectors }
