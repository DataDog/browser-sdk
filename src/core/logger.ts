import { Configuration } from './configuration'
import { addGlobalContext, getCommonContext, getGlobalContext, setGlobalContext } from './context'
import { monitored } from './internalMonitoring'
import { Batch, HttpRequest } from './transport'

export interface LogsMessage {
  message: string
  severity: LogLevelType
  [key: string]: any
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

export function startLogger(configuration: Configuration) {
  let handler: (message: LogsMessage) => void = () => undefined
  if (configuration.logHandler === LogHandlerType.http) {
    const batch = new Batch<LogsMessage>(
      new HttpRequest(configuration.logsEndpoint, configuration.batchBytesLimit),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout,
      () => ({
        ...getCommonContext(),
        ...getGlobalContext(),
      })
    )
    handler = (message: LogsMessage) => batch.add(message)
  } else if (configuration.logHandler === LogHandlerType.console) {
    handler = (message: LogsMessage) => {
      console.log(`${message.severity}: ${message.message}`)
    }
  }

  const logger = new Logger(handler, configuration.logLevel)
  window.Datadog.setGlobalContext = setGlobalContext
  window.Datadog.addGlobalContext = addGlobalContext
  window.Datadog.log = logger.log.bind(logger)
  window.Datadog.debug = logger.debug.bind(logger)
  window.Datadog.info = logger.info.bind(logger)
  window.Datadog.warn = logger.warn.bind(logger)
  window.Datadog.error = logger.error.bind(logger)

  return logger
}

export class Logger {
  constructor(private handler: (message: LogsMessage) => void, private logLevel: LogLevelType) {}

  @monitored
  log(message: string, context = {}, severity = LogLevelType.info) {
    if (LOG_LEVEL_PRIORITIES[severity] >= LOG_LEVEL_PRIORITIES[this.logLevel]) {
      this.handler({ message, severity, ...context })
    }
  }

  debug(message: string, context = {}) {
    this.log(message, context, LogLevelType.debug)
  }

  info(message: string, context = {}) {
    this.log(message, context, LogLevelType.info)
  }

  warn(message: string, context = {}) {
    this.log(message, context, LogLevelType.warn)
  }

  error(message: string, context = {}) {
    this.log(message, context, LogLevelType.error)
  }
}
