import { Configuration } from './configuration'
import { addGlobalContext, getCommonContext, getGlobalContext, setGlobalContext } from './context'
import { monitored } from './internalMonitoring'
import { Batch, HttpRequest } from './transport'

export interface LogsMessage {
  message: string
  severity: LogLevelEnum
  [key: string]: any
}

export enum LogLevelEnum {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export type LogLevel = keyof typeof LogLevelEnum

const LOG_LEVEL_PRIORITIES: { [key in LogLevelEnum]: number } = {
  [LogLevelEnum.debug]: 0,
  [LogLevelEnum.info]: 1,
  [LogLevelEnum.warn]: 2,
  [LogLevelEnum.error]: 3,
}

export const LOG_LEVELS = Object.keys(LogLevelEnum)

export enum LogSendStrategyEnum {
  api = 'api',
  console = 'console',
  silent = 'silent',
}

export function startLogger(configuration: Configuration) {
  let sendStrategy: (message: LogsMessage) => void = () => undefined
  if (configuration.logSendStrategy === LogSendStrategyEnum.api) {
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
    sendStrategy = (message: LogsMessage) => batch.add(message)
  } else if (configuration.logSendStrategy === LogSendStrategyEnum.console) {
    sendStrategy = (message: LogsMessage) => {
      console.log(`${message.severity}: ${message.message}`)
    }
  }

  const logger = new Logger(sendStrategy, configuration.logLevel)
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
  constructor(private send: (message: LogsMessage) => void, private logLevel: LogLevelEnum) {}

  @monitored
  log(message: string, context = {}, severity = LogLevelEnum.info) {
    if (LOG_LEVEL_PRIORITIES[severity] >= LOG_LEVEL_PRIORITIES[this.logLevel]) {
      this.send({ message, severity, ...context })
    }
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
