import {
  areCookiesAuthorized,
  assign,
  checkIsNotLocalFile,
  commonInit,
  Context,
  ContextValue,
  getGlobalObject,
  isPercentage,
  makeGlobal,
  makeStub,
  monitor,
  mustUseSecureCookie,
  UserConfiguration,
} from '@datadog/browser-core'
import { buildEnv } from './buildEnv'
import { HandlerType, Logger, LoggerConfiguration, startLogger, StatusType } from './logger'
import { startLoggerSession } from './loggerSession'

export interface LogsUserConfiguration extends UserConfiguration {
  forwardErrorsToLogs?: boolean
}

export type Status = keyof typeof StatusType

const STUBBED_LOGGER = {
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
  addContext(key: string, value: ContextValue) {
    makeStub('logs.logger.addContext')
  },
  removeContext(key: string) {
    makeStub('logs.logger.removeContext')
  },
  setHandler(handler: HandlerType) {
    makeStub('logs.logger.setHandler')
  },
  setLevel(level: StatusType) {
    makeStub('logs.logger.setLevel')
  },
}

const STUBBED_LOGS = {
  logger: STUBBED_LOGGER,
  init(userConfiguration: LogsUserConfiguration) {
    makeStub('core.init')
  },
  addLoggerGlobalContext(key: string, value: ContextValue) {
    makeStub('addLoggerGlobalContext')
  },
  removeLoggerGlobalContext(key: string) {
    makeStub('removeLoggerGlobalContext')
  },
  setLoggerGlobalContext(context: Context) {
    makeStub('setLoggerGlobalContext')
  },
  createLogger(name: string, conf?: LoggerConfiguration): Logger {
    makeStub('createLogger')
    return STUBBED_LOGGER as Logger
  },
  getLogger(name: string): Logger | undefined {
    makeStub('getLogger')
    return undefined
  },
}

export type LogsGlobal = typeof STUBBED_LOGS

export const datadogLogs = makeLogsGlobal(STUBBED_LOGS)

interface BrowserWindow extends Window {
  DD_LOGS?: LogsGlobal
}

getGlobalObject<BrowserWindow>().DD_LOGS = datadogLogs

export function makeLogsGlobal(stub: LogsGlobal) {
  const global = makeGlobal(stub)

  let isAlreadyInitialized = false

  global.init = monitor((userConfiguration: LogsUserConfiguration) => {
    if (!checkIsNotLocalFile() || !canInitLogs(userConfiguration)) {
      return
    }

    if (userConfiguration.publicApiKey) {
      userConfiguration.clientToken = userConfiguration.publicApiKey
      console.warn('Public API Key is deprecated. Please use Client Token instead.')
    }
    const isCollectingError = userConfiguration.forwardErrorsToLogs !== false
    const logsUserConfiguration = {
      ...userConfiguration,
      isCollectingError,
    }
    const { errorObservable, configuration, internalMonitoring } = commonInit(logsUserConfiguration, buildEnv)
    const session = startLoggerSession(configuration, areCookiesAuthorized(mustUseSecureCookie(userConfiguration)))
    const globalApi = startLogger(errorObservable, configuration, session, internalMonitoring)
    assign(global, globalApi)
    isAlreadyInitialized = true
  })

  function canInitLogs(userConfiguration: LogsUserConfiguration) {
    if (isAlreadyInitialized) {
      if (!userConfiguration.silentMultipleInit) {
        console.error('DD_LOGS is already initialized.')
      }
      return false
    }
    if (!userConfiguration || (!userConfiguration.publicApiKey && !userConfiguration.clientToken)) {
      console.error('Client Token is not configured, we will not send any data.')
      return false
    }
    if (userConfiguration.sampleRate !== undefined && !isPercentage(userConfiguration.sampleRate)) {
      console.error('Sample Rate should be a number between 0 and 100')
      return false
    }
    return true
  }

  return global
}
