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
  status: StatusType
  [key: string]: any
}

export interface LoggerConfiguration {
  level?: StatusType
  logLevel?: StatusType // DEPRECATED
  logHandler?: LogHandlerType
  context?: Context
}

export enum StatusType {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export type Status = keyof typeof StatusType

const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export const STATUSES = Object.keys(StatusType)

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
    customLoggers[name] = new Logger(logHandlers, conf.logHandler, conf.level || conf.logLevel, conf.context)
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
    private level = StatusType.debug,
    private loggerContext: Context = {}
  ) {
    this.handler = this.logHandlers[logHandler]
  }

  @monitored
  log(message: string, messageContext = {}, status = StatusType.info) {
    if (STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[this.level]) {
      this.handler({ message, status, ...getLoggerGlobalContext(), ...this.loggerContext, ...messageContext })
    }
  }

  debug(message: string, messageContext = {}) {
    this.log(message, messageContext, StatusType.debug)
  }

  info(message: string, messageContext = {}) {
    this.log(message, messageContext, StatusType.info)
  }

  warn(message: string, messageContext = {}) {
    this.log(message, messageContext, StatusType.warn)
  }

  error(message: string, messageContext = {}) {
    this.log(message, messageContext, StatusType.error)
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
  setLogLevel(level: StatusType) {
    this.level = level
  }

  setLevel(level: StatusType) {
    this.level = level
  }
}
