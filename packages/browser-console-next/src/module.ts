import type { Module, ModuleContext } from '@datadog/core-next'
import { startConsoleCollection } from './consoleCollector'

const consoleModule: Module = {
  name: 'console',
  extension: {
    key: 'console',
    validate: () => ({}),
  },
  init(context: ModuleContext) {
    const stop = startConsoleCollection(context.pipeline)
    return { stop }
  },
}

export { consoleModule }
