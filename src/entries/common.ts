import { buildConfiguration, Configuration, UserConfiguration } from '../core/configuration'
import { Context } from '../core/context'
import { monitor, setDebugMode, startInternalMonitoring } from '../core/internalMonitoring'
import { LogHandlerType, LogLevel, LogLevelType, startLogger } from '../core/logger'
import { startSessionTracking } from '../core/session'
import { ErrorObservable, startErrorCollection } from '../errorCollection/errorCollection'

declare global {
  interface Window {
    Datadog: Datadog
  }
}

function makeStub(methodName: string) {
  console.warn(`'${methodName}' not yet available, please call '.init()' first.`)
}

const STUBBED_DATADOG = {
  logger: {
    debug(message: string, context?: Context) {
      makeStub('logger.debug')
    },
    error(message: string, context?: Context) {
      makeStub('logger.error')
    },
    info(message: string, context?: Context) {
      makeStub('logger.info')
    },
    log(message: string, context?: Context, severity?: LogLevel) {
      makeStub('logger.log')
    },
    warn(message: string, context?: Context) {
      makeStub('logger.warn')
    },
    setContext(context: Context) {
      makeStub('logger.setContext')
    },
    addContext(key: string, value: any) {
      makeStub('logger.addContext')
    },
    setLogHandler(logHandler: LogHandlerType) {
      makeStub('logger.setLogHandler')
    },
    setLogLevel(logLevel: LogLevelType) {
      makeStub('logger.setLogLevel')
    },
  },
  init<T extends UserConfiguration>(userConfiguration: T) {
    makeStub('init')
  },
  addLoggerGlobalContext(key: string, value: any) {
    makeStub('addLoggerGlobalContext')
  },
  setLoggerGlobalContext(context: Context) {
    makeStub('setLoggerGlobalContext')
  },
}

export type Datadog = typeof STUBBED_DATADOG

export function buildInit<T extends UserConfiguration>(
  postInit?: (userConfiguration: T, configuration: Configuration, errorObservable: ErrorObservable) => void
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
    if (!userConfiguration || !userConfiguration.publicApiKey) {
      console.error('Public API Key is not configured, we will not send any data.')
      return
    }

    monitor(() => {
      const configuration = buildConfiguration(userConfiguration)
      startInternalMonitoring(configuration)

      startSessionTracking()

      const logger = startLogger(configuration)
      const errorObservable = startErrorCollection(configuration, logger)

      if (postInit) {
        postInit(userConfiguration, configuration, errorObservable)
      }
    })()
  }) as Datadog['init']
}
