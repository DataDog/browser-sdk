import type { Module, ModuleContext } from '@datadog/core-next'
import { startRuntimeErrorCollection } from './runtimeErrorCollector'
import { startReportCollection } from './reportCollector'

const errorsModule: Module = {
  name: 'errors',
  extension: {
    key: 'errors',
    validate: () => ({}),
  },
  init(context: ModuleContext) {
    const stopRuntime = startRuntimeErrorCollection(context.pipeline)
    const stopReports = startReportCollection(context.pipeline)
    return {
      stop() {
        stopRuntime()
        stopReports()
      },
    }
  },
}

export { errorsModule }
