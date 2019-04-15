import { Configuration } from './configuration'
import { addGlobalContext, getCommonContext, getGlobalContext, setGlobalContext } from './context'
import { monitored } from './internalMonitoring'
import { Batch, HttpRequest } from './transport'

export interface LogsMessage {
  message: string
  severity?: LogLevelEnum
  [key: string]: any
}

export enum LogLevelEnum {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export type LogLevel = keyof typeof LogLevelEnum

export const LOG_LEVELS = Object.keys(LogLevelEnum)

export function startLogger(configuration: Configuration) {
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

  const logger = new Logger(batch)
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
  constructor(private batch: Batch<LogsMessage>) {}

  @monitored
  log(message: string, context = {}, severity = LogLevelEnum.info) {
    this.batch.add({ message, severity, ...context })
  }

  debug(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.debug)
  }

  info(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.info)
  }

  warn(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.warn)
  }

  error(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.error)
  }
}
