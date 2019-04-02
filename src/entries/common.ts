import { buildConfiguration, UserConfiguration } from '../core/configuration'
import { Context } from '../core/context'
import { Logger, LogLevel, startLogger } from '../core/logger'
import { monitor, setDebugMode, startMonitoring } from '../core/monitoring'
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
  debug(message: string, context?: Context) {
    makeStub('debug')
  },
  init<T extends UserConfiguration>(userConfiguration: T) {
    makeStub('init')
  },
  error(message: string, context?: Context) {
    makeStub('error')
  },
  info(message: string, context?: Context) {
    makeStub('info')
  },
  log(message: string, context?: Context, severity?: LogLevel) {
    makeStub('log')
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
  // Add an "hidden" property to set debug mode. We define it that way to hide it
  // as much as possible but of course it's not a real protection.
  Object.defineProperty(window.Datadog, '_setDebug', {
    get() {
      return setDebugMode
    },
    enumerable: false,
  })

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
