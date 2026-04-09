import type { Pipeline } from '@datadog/core-next'
import { startRuntimeErrorCollection } from '../runtimeErrorCollector'
import { startReportCollection } from '../reportCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const stopRuntime = startRuntimeErrorCollection(pipeline)
  const stopReports = startReportCollection(pipeline)
  return () => {
    stopRuntime()
    stopReports()
  }
}

export { startCollectors }
