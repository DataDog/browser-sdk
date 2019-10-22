import {
  commonInit,
  Context,
  ContextValue,
  isPercentage,
  makeGlobal,
  makeStub,
  monitor,
  UserConfiguration,
} from '@browser-agent/core'
import lodashAssign from 'lodash.assign'

import { HandlerType, Logger, LoggerConfiguration, startLogger, StatusType } from './logger'
import { startLoggerSession } from './loggerSession'
import { version } from './version'

declare global {
  interface Window {
    DD_LOGS: LogsGlobal
  }
}

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
  if (!userConfiguration || (!userConfiguration.publicApiKey && !userConfiguration.clientToken)) {
    console.error('Client Token is not configured, we will not send any data.')
    return
  }
  if (userConfiguration.publicApiKey) {
    userConfiguration.clientToken = userConfiguration.publicApiKey
    console.warn('Public API Key is deprecated. Please use Client Token instead.')
  }
  if (userConfiguration.sampleRate !== undefined && !isPercentage(userConfiguration.sampleRate)) {
    console.error('Sample Rate should be a number between 0 and 100')
    return
  }
  const isCollectingError = userConfiguration.forwardErrorsToLogs !== false
  const logsUserConfiguration = {
    ...userConfiguration,
    isCollectingError,
  }
  const { errorObservable, configuration } = commonInit(logsUserConfiguration, version)
  const session = startLoggerSession(configuration)
  const globalApi = startLogger(errorObservable, configuration, session)
  lodashAssign(window.DD_LOGS, globalApi)
})
