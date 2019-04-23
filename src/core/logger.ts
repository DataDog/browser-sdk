import { Configuration } from './configuration'
import {
  addLoggerGlobalContext,
  Context,
  getCommonContext,
  getLoggerGlobalContext,
  setLoggerGlobalContext,
} from './context'
import { monitored } from './internalMonitoring'
import { Batch, HttpRequest } from './transport'

export interface LogsMessage {
  message: string
  severity: LogLevelType
  [key: string]: any
}

export interface LoggerConfiguration {
  logLevel?: LogLevelType
  logHandler?: LogHandlerType
  context?: Context
}

export enum LogLevelType {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export type LogLevel = keyof typeof LogLevelType

const LOG_LEVEL_PRIORITIES: { [key in LogLevelType]: number } = {
  [LogLevelType.debug]: 0,
  [LogLevelType.info]: 1,
  [LogLevelType.warn]: 2,
  [LogLevelType.error]: 3,
}

export const LOG_LEVELS = Object.keys(LogLevelType)

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
    [LogHandlerType.console]: (message: LogsMessage) => console.log(`${message.severity}: ${message.message}`),
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
    customLoggers[name] = new Logger(logHandlers, conf.logHandler, conf.logLevel, conf.context)
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
    private logLevel = LogLevelType.debug,
    private loggerContext: Context = {}
  ) {
    this.handler = this.logHandlers[logHandler]
  }

  @monitored
  log(message: string, messageContext = {}, severity = LogLevelType.info) {
    if (LOG_LEVEL_PRIORITIES[severity] >= LOG_LEVEL_PRIORITIES[this.logLevel]) {
      this.handler({ message, severity, ...getLoggerGlobalContext(), ...this.loggerContext, ...messageContext })
    }
  }

  debug(message: string, messageContext = {}) {
    this.log(message, messageContext, LogLevelType.debug)
  }

  info(message: string, messageContext = {}) {
    this.log(message, messageContext, LogLevelType.info)
  }

  warn(message: string, messageContext = {}) {
    this.log(message, messageContext, LogLevelType.warn)
  }

  error(message: string, messageContext = {}) {
    this.log(message, messageContext, LogLevelType.error)
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

  setLogLevel(logLevel: LogLevelType) {
    this.logLevel = logLevel
  }
}
