import lodashMerge from 'lodash.merge'

import { Configuration } from '../core/configuration'
import { Context, getCommonContext } from '../core/context'
import { ErrorMessage, ErrorObservable } from '../core/errorCollection'
import { monitored } from '../core/internalMonitoring'
import { Batch, HttpRequest } from '../core/transport'
import { noop } from '../core/utils'
import { LogsGlobal } from './logs.entry'

export interface LogsMessage {
  message: string
  status: StatusType
  [key: string]: any
}

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType
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

export enum HandlerType {
  http = 'http',
  console = 'console',
  silent = 'silent',
}

type Handlers = { [key in HandlerType]: (message: LogsMessage) => void }

export function startLogger(errorObservable: ErrorObservable, configuration: Configuration) {
  let globalContext: Context = {}
  const batch = new Batch<LogsMessage>(
    new HttpRequest(configuration.logsEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => lodashMerge({}, getCommonContext(), globalContext)
  )
  const handlers = {
    [HandlerType.console]: (message: LogsMessage) => console.log(`${message.status}: ${message.message}`),
    [HandlerType.http]: (message: LogsMessage) => batch.add(message),
    [HandlerType.silent]: noop,
  }
  const logger = new Logger(handlers)
  customLoggers = {}
  errorObservable.subscribe((e: ErrorMessage) => logger.error(e.message, e.context))

  const globalApi: Partial<LogsGlobal> = {}
  globalApi.setLoggerGlobalContext = (context: Context) => {
    globalContext = context
  }
  globalApi.addLoggerGlobalContext = (key: string, value: any) => {
    globalContext[key] = value
  }
  globalApi.createLogger = makeCreateLogger(handlers)
  globalApi.getLogger = getLogger
  globalApi.logger = logger
  return globalApi
}

let customLoggers: { [name: string]: Logger }

function makeCreateLogger(handlers: Handlers) {
  return (name: string, conf: LoggerConfiguration = {}) => {
    customLoggers[name] = new Logger(handlers, conf.handler, conf.level, {
      ...conf.context,
      logger: { name },
    })
    return customLoggers[name]
  }
}

function getLogger(name: string) {
  return customLoggers[name]
}

export class Logger {
  private handler: (message: LogsMessage) => void

  constructor(
    private handlers: { [key in HandlerType]: (message: LogsMessage) => void },
    handler = HandlerType.http,
    private level = StatusType.debug,
    private loggerContext: Context = {}
  ) {
    this.handler = this.handlers[handler]
  }

  @monitored
  log(message: string, messageContext = {}, status = StatusType.info) {
    if (STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[this.level]) {
      this.handler({ message, status, ...lodashMerge({}, this.loggerContext, messageContext) })
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

  setHandler(handler: HandlerType) {
    this.handler = this.handlers[handler]
  }

  setLevel(level: StatusType) {
    this.level = level
  }
}
