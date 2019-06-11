import { UserConfiguration } from '../core/configuration'
import { Context, ContextValue } from '../core/context'
import { commonInit, makeGlobal, makeStub } from '../core/init'
import { monitor } from '../core/internalMonitoring'
import { HandlerType, Logger, LoggerConfiguration, startLogger, Status, StatusType } from './logger'

declare global {
  interface Window {
    DD_LOGS: LogsGlobal
  }
}

export interface LogsUserConfiguration extends UserConfiguration {
  forwardErrorsToLogs?: boolean
}

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

window.DD_LOGS = makeGlobal(STUBBED_LOGS)
window.DD_LOGS.init = monitor((userConfiguration: LogsUserConfiguration) => {
  if (!userConfiguration || !userConfiguration.publicApiKey) {
    console.error('Public API Key is not configured, we will not send any data.')
    return
  }
  const isCollectingError = userConfiguration.forwardErrorsToLogs !== false
  const logsUserConfiguration = {
    ...userConfiguration,
    isCollectingError,
  }
  const { errorObservable, configuration } = commonInit(logsUserConfiguration)
  const globalApi = startLogger(errorObservable, configuration)
  Object.assign(window.DD_LOGS, globalApi)
})
