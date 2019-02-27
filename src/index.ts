import { Configuration, ConfigurationOverride } from './core/configuration'
import { Context } from './core/context'
import { loggerModule, LogLevel } from './core/logger'
import { initMonitoring, monitor } from './core/monitoring'
import { errorCollectionModule } from './errorCollection/errorCollection'
import { rumModule } from './rum/rum'

declare global {
  interface Window {
    Datadog: Datadog
  }
}

function makeStub(methodName: string) {
  console.warn(`'${methodName}' not yet available, please call '.init()' first.`)
}

const STUBBED_DATADOG = {
  init(apiKey: string, override?: ConfigurationOverride) {
    makeStub('init')
  },
  error(message: string, context?: Context) {
    makeStub('error')
  },
  debug(message: string, context?: Context) {
    makeStub('debug')
  },
  log(message: string, context?: Context, severity?: LogLevel) {
    makeStub('log')
  },
  info(message: string, context?: Context) {
    makeStub('info')
  },
  trace(message: string, context?: Context) {
    makeStub('trace')
  },
  warn(message: string, context?: Context) {
    makeStub('warn')
  },
  addGlobalContext(key: string, value: any) {
    makeStub('addGlobalContext')
  },
  setGlobalContext(context: Context) {
    makeStub('setGlobalContext')
  },
}

export type Datadog = typeof STUBBED_DATADOG

try {
  const configuration = new Configuration()

  window.Datadog = STUBBED_DATADOG
  initMonitoring(configuration)

  window.Datadog.init = makeInit(configuration)
} catch {
  // nothing to do
}

function makeInit(configuration: Configuration) {
  return monitor((apiKey: string, override: ConfigurationOverride = {}) => {
    configuration.apiKey = apiKey
    configuration.apply(override)
    const logger = loggerModule(configuration)
    errorCollectionModule(configuration, logger)
    rumModule(logger)
  })
}
