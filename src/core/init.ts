import { ErrorObservable, startErrorCollection } from '../logs/errorCollection'
import { HandlerType, Logger, LoggerConfiguration, startLogger, Status, StatusType } from '../logs/logger'
import { buildConfiguration, Configuration, UserConfiguration } from './configuration'
import { Context } from './context'
import { monitor, setDebugMode, startInternalMonitoring } from './internalMonitoring'
import { startSessionTracking } from './session'

declare global {
  interface Window {
    Datadog: Datadog
  }
}

function makeStub(methodName: string) {
  console.warn(`'${methodName}' not yet available, please call '.init()' first.`)
}

const LOGGER_STUB = {
  debug(message: string, context?: Context) {
    makeStub('logs.logger.debug')
  },
  error(message: string, context?: Context) {
    makeStub('logs.logger.error')
  },
  info(message: string, context?: Context) {
    makeStub('logs.logger.info')
  },
  log(message: string, context?: Context, status?: Status) {
    makeStub('logs.logger.log')
  },
  warn(message: string, context?: Context) {
    makeStub('logs.logger.warn')
  },
  setContext(context: Context) {
    makeStub('logs.logger.setContext')
  },
  addContext(key: string, value: any) {
    makeStub('logs.logger.addContext')
  },
  setLogHandler(handler: HandlerType) {
    makeStub('DEPRECATED logs.logger.setHandler')
  },
  setHandler(handler: HandlerType) {
    makeStub('logs.logger.setHandler')
  },
  setLogLevel(level: StatusType) {
    makeStub('DEPRECATED logs.logger.setLogLevel')
  },
  setLevel(level: StatusType) {
    makeStub('logs.logger.setLevel')
  },
}

const STUBBED_DATADOG = {
  logger: LOGGER_STUB,
  init<T extends UserConfiguration>(userConfiguration: T) {
    makeStub('core.init')
  },
  addLoggerGlobalContext(key: string, value: any) {
    makeStub('addLoggerGlobalContext')
  },
  setLoggerGlobalContext(context: Context) {
    makeStub('setLoggerGlobalContext')
  },
  createLogger(name: string, conf?: LoggerConfiguration): Logger {
    makeStub('createLogger')
    return LOGGER_STUB as Logger
  },
  getLogger(name: string): Logger | undefined {
    makeStub('getLogger')
    return undefined
  },
}

type Datadog = typeof STUBBED_DATADOG

export function buildInit<T extends UserConfiguration>(
  postInit?: (userConfiguration: T, configuration: Configuration, errorObservable: ErrorObservable) => void
) {
  window.Datadog = { ...STUBBED_DATADOG }
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
