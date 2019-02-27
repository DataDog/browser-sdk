import { Configuration } from './configuration'
import { addGlobalContext, getCommonContext, getGlobalContext, setGlobalContext } from './context'
import { monitored } from './monitoring'
import { Batch, flushOnPageHide, HttpRequest } from './transport'

export interface Message {
  message: string
  severity?: string
  [key: string]: any
}

export enum LogLevelEnum {
  trace = 'trace',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export type LogLevel = keyof typeof LogLevelEnum

export const LOG_LEVELS = Object.keys(LogLevelEnum)

export function loggerModule(configuration: Configuration) {
  const transport = new HttpRequest(configuration.logsEndpoint)
  const batch = new Batch(transport, configuration.maxBatchSize, configuration.batchBytesLimit, () => ({
    ...getCommonContext(),
    ...getGlobalContext(),
  }))
  flushOnPageHide(batch)

  const logger = new Logger(batch)
  window.Datadog.setGlobalContext = setGlobalContext
  window.Datadog.addGlobalContext = addGlobalContext
  window.Datadog.log = logger.log.bind(logger)
  window.Datadog.trace = logger.trace.bind(logger)
  window.Datadog.debug = logger.debug.bind(logger)
  window.Datadog.info = logger.info.bind(logger)
  window.Datadog.warn = logger.warn.bind(logger)

  window.Datadog.error = logger.error.bind(logger)
  return logger
}

export class Logger {
  constructor(private batch: Batch) {}

  @monitored
  log(message: string, context = {}, severity = LogLevelEnum.info) {
    this.batch.add({ message, severity, ...context })
  }

  trace(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.trace)
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
