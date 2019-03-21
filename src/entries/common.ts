import { buildConfiguration, UserConfiguration } from '../core/configuration'
import { Context } from '../core/context'
import { Logger, LogLevel, startLogger } from '../core/logger'
import { monitor, startMonitoring } from '../core/monitoring'
import { startSessionTracking } from '../core/session'
import { Batch } from '../core/transport'
import { startErrorCollection } from '../errorCollection/errorCollection'

declare global {
  interface Window {
    Datadog: Datadog
  }
}

function makeStub(methodName: string) {
  console.warn(`'${methodName}' not yet available, please call '.init()' first.`)
}

const STUBBED_DATADOG = {
  init<T extends UserConfiguration>(userConfiguration: T) {
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

export function buildInit<T extends UserConfiguration>(
  postInit?: (userConfiguration: T, batch: Batch, logger: Logger) => void
) {
  window.Datadog = STUBBED_DATADOG

  window.Datadog.init = ((userConfiguration: T) => {
    if (!userConfiguration || !userConfiguration.apiKey) {
      console.error('API Key is not configured, we will not send any data.')
      return
    }
    monitor(() => {
      const configuration = buildConfiguration(userConfiguration)
      startMonitoring(configuration)

      startSessionTracking()

      const { batch, logger } = startLogger(configuration)
      startErrorCollection(configuration, logger)

      if (postInit) {
        postInit(userConfiguration, batch, logger)
      }
    })()
  }) as Datadog['init']
}
