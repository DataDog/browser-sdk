import { Configuration } from './configuration'
import { addGlobalContext, getCommonContext, getGlobalContext, setGlobalContext } from './context'
import { monitored } from './monitoring'
import { Batch, HttpRequest } from './transport'

export interface Message {
  message: string
  severity?: LogLevelEnum
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

export function startLogger(configuration: Configuration) {
  const batch = new Batch(
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
  window.Datadog.trace = logger.trace.bind(logger)
  window.Datadog.debug = logger.debug.bind(logger)
  window.Datadog.info = logger.info.bind(logger)
  window.Datadog.warn = logger.warn.bind(logger)
  window.Datadog.error = logger.error.bind(logger)

  return { batch, logger }
}

export class Logger {
  public errorCount: number = 0
  constructor(private batch: Batch) {}

  getEndpoint() {
    return this.batch.getEndpoint()
  }

  @monitored
  log(message: string, context = {}, severity = LogLevelEnum.info) {
    if (severity === LogLevelEnum.error) {
      this.errorCount += 1
    }

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
