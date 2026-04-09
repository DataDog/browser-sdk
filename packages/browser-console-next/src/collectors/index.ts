import type { Pipeline } from '@datadog/core-next'
import { startConsoleCollection } from '../consoleCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  return startConsoleCollection(pipeline)
}

export { startCollectors }
