import { Configuration } from '../core/configuration'
import {
  addLoggerGlobalContext,
  Context,
  getCommonContext,
  getLoggerGlobalContext,
  setLoggerGlobalContext,
} from '../core/context'
import { monitored } from '../core/internalMonitoring'
import { Batch, HttpRequest } from '../core/transport'

export interface LogsMessage {
  message: string
  status: LogStatusType
  [key: string]: any
}

export interface LoggerConfiguration {
  logStatus?: LogStatusType
  logLevel?: LogStatusType // DEPRECATED
  logHandler?: LogHandlerType
  context?: Context
}

export enum LogStatusType {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export type LogStatus = keyof typeof LogStatusType

const LOG_STATUS_PRIORITIES: { [key in LogStatusType]: number } = {
  [LogStatusType.debug]: 0,
  [LogStatusType.info]: 1,
  [LogStatusType.warn]: 2,
  [LogStatusType.error]: 3,
}

export const LOG_STATUSES = Object.keys(LogStatusType)

export enum LogHandlerType {
  http = 'http',
  console = 'console',
  silent = 'silent',
}

type LogHandlers = { [key in LogHandlerType]: (message: LogsMessage) => void }

export function startLogger(configuration: Configuration) {
  const batch = new Batch<LogsMessage>(
    new HttpRequest(configuration.logsEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
    })
  )
  const logHandlers = {
    [LogHandlerType.console]: (message: LogsMessage) => console.log(`${message.status}: ${message.message}`),
    [LogHandlerType.http]: (message: LogsMessage) => batch.add(message),
    [LogHandlerType.silent]: () => undefined,
  }
  const logger = new Logger(logHandlers)
  customLoggers = {}
  window.Datadog.setLoggerGlobalContext = setLoggerGlobalContext
  window.Datadog.addLoggerGlobalContext = addLoggerGlobalContext
  window.Datadog.createLogger = makeCreateLogger(logHandlers)
  window.Datadog.getLogger = getLogger
  window.Datadog.logger = logger

  return logger
}

let customLoggers: { [name: string]: Logger }

function makeCreateLogger(logHandlers: LogHandlers) {
  return (name: string, conf: LoggerConfiguration = {}) => {
    customLoggers[name] = new Logger(logHandlers, conf.logHandler, conf.logStatus || conf.logLevel, conf.context)
    return customLoggers[name]
  }
}

function getLogger(name: string) {
  return customLoggers[name]
}

export class Logger {
  private handler: (message: LogsMessage) => void

  constructor(
    private logHandlers: { [key in LogHandlerType]: (message: LogsMessage) => void },
    logHandler = LogHandlerType.http,
    private logStatus = LogStatusType.debug,
    private loggerContext: Context = {}
  ) {
    this.handler = this.logHandlers[logHandler]
  }

  @monitored
  log(message: string, messageContext = {}, status = LogStatusType.info) {
    if (LOG_STATUS_PRIORITIES[status] >= LOG_STATUS_PRIORITIES[this.logStatus]) {
      this.handler({ message, status, ...getLoggerGlobalContext(), ...this.loggerContext, ...messageContext })
    }
  }

  debug(message: string, messageContext = {}) {
    this.log(message, messageContext, LogStatusType.debug)
  }

  info(message: string, messageContext = {}) {
    this.log(message, messageContext, LogStatusType.info)
  }

  warn(message: string, messageContext = {}) {
    this.log(message, messageContext, LogStatusType.warn)
  }

  error(message: string, messageContext = {}) {
    this.log(message, messageContext, LogStatusType.error)
  }

  setContext(context: Context) {
    this.loggerContext = context
  }

  addContext(key: string, value: any) {
    this.loggerContext[key] = value
  }

  setLogHandler(logHandler: LogHandlerType) {
    this.handler = this.logHandlers[logHandler]
  }

  // DEPRECATED
  setLogLevel(logStatus: LogStatusType) {
    this.logStatus = logStatus
  }

  setLogStatus(logStatus: LogStatusType) {
    this.logStatus = logStatus
  }
}
