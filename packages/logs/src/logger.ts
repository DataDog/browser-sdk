import {
  Batch,
  Configuration,
  Context,
  ContextValue,
  ErrorMessage,
  ErrorObservable,
  ErrorOrigin,
  HttpRequest,
  monitored,
  noop,
} from '@datadog/browser-core'
import lodashMerge from 'lodash.merge'

import { LoggerSession } from './loggerSession'
import { LogsGlobal } from './logs.entry'

export enum StatusType {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export const STATUSES = Object.keys(StatusType)

export interface LogsMessage {
  message: string
  status: StatusType
  [key: string]: ContextValue
}

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType
  context?: Context
}

export enum HandlerType {
  http = 'http',
  console = 'console',
  silent = 'silent',
}

type Handlers = { [key in HandlerType]: (message: LogsMessage) => void }

export function startLogger(errorObservable: ErrorObservable, configuration: Configuration, session: LoggerSession) {
  let globalContext: Context = {}
  const batch = new Batch<LogsMessage>(
    new HttpRequest(configuration.logsEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () =>
      lodashMerge(
        {
          date: new Date().getTime(),
          session_id: session.getId(),
          view: {
            referrer: document.referrer,
            url: window.location.href,
          },
        },
        globalContext,
        getRUMInternalContext()
      ) as Context
  )
  const handlers = {
    [HandlerType.console]: (message: LogsMessage) => console.log(`${message.status}: ${message.message}`),
    [HandlerType.http]: (message: LogsMessage) => batch.add(message),
    [HandlerType.silent]: noop,
  }
  const logger = new Logger(session, handlers)
  customLoggers = {}
  errorObservable.subscribe((e: ErrorMessage) => logger.error(e.message, e.context))

  const globalApi: Partial<LogsGlobal> = {}
  globalApi.setLoggerGlobalContext = (context: Context) => {
    globalContext = context
  }
  globalApi.addLoggerGlobalContext = (key: string, value: ContextValue) => {
    globalContext[key] = value
  }
  globalApi.createLogger = makeCreateLogger(session, handlers)
  globalApi.getLogger = getLogger
  globalApi.logger = logger
  return globalApi
}

let customLoggers: { [name: string]: Logger }

function makeCreateLogger(session: LoggerSession, handlers: Handlers) {
  return (name: string, conf: LoggerConfiguration = {}) => {
    customLoggers[name] = new Logger(session, handlers, conf.handler, conf.level, {
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
    private session: LoggerSession,
    private handlers: { [key in HandlerType]: (message: LogsMessage) => void },
    handler = HandlerType.http,
    private level = StatusType.debug,
    private loggerContext: Context = {}
  ) {
    this.handler = this.handlers[handler]
  }

  @monitored
  log(message: string, messageContext = {}, status = StatusType.info) {
    if (this.session.isTracked() && STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[this.level]) {
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
    const errorOrigin = {
      error: {
        origin: ErrorOrigin.LOGGER,
      },
    }
    this.log(message, lodashMerge({}, errorOrigin, messageContext), StatusType.error)
  }

  setContext(context: Context) {
    this.loggerContext = context
  }

  addContext(key: string, value: ContextValue) {
    this.loggerContext[key] = value
  }

  setHandler(handler: HandlerType) {
    this.handler = this.handlers[handler]
  }

  setLevel(level: StatusType) {
    this.level = level
  }
}

interface Rum {
  getInternalContext: () => object
}

function getRUMInternalContext(): object | undefined {
  const rum = (window as any).DD_RUM as Rum
  return rum && rum.getInternalContext ? rum.getInternalContext() : undefined
}
