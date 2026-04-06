import type { Module, ModuleContext } from '@datadog/core-next'
import { startXhrCollection } from './xhrCollector'
import { startFetchCollection } from './fetchCollector'

const networkModule: Module = {
  name: 'network',
  extension: {
    key: 'network',
    validate: () => ({}),
  },
  init(context: ModuleContext) {
    const stopXhr = startXhrCollection(context.pipeline)
    const stopFetch = startFetchCollection(context.pipeline)
    return {
      stop() {
        stopXhr()
        stopFetch()
      },
    }
  },
}

export { networkModule }
