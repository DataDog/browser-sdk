import type { Context, ContextManager, CustomerDataTracker } from '@datadog/browser-core'
import {
  clocksNow,
  computeRawError,
  ErrorHandling,
  computeStackTrace,
  combine,
  createContextManager,
  ErrorSource,
  monitored,
  sanitize,
  NonErrorPrefix,
  createHandlingStack,
} from '@datadog/browser-core'

import type { RawLoggerLogsEvent } from '../rawLogsEvent.types'
import { isAuthorized, StatusType } from './logger/isAuthorized'

export interface LogsMessage {
  message: string
  status: StatusType
  context?: Context
}

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const

export type HandlerType = (typeof HandlerType)[keyof typeof HandlerType]
export const STATUSES = Object.keys(StatusType) as StatusType[]

// note: it is safe to merge declarations as long as the methods are actually defined on the prototype
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Logger {
  private contextManager: ContextManager

  constructor(
    private handleLogStrategy: (logsMessage: LogsMessage, logger: Logger, handlingStack?: string) => void,
    customerDataTracker: CustomerDataTracker,
    name?: string,
    private handlerType: HandlerType | HandlerType[] = HandlerType.http,
    private level: StatusType = StatusType.debug,
    loggerContext: object = {}
  ) {
    this.contextManager = createContextManager(customerDataTracker)
    this.contextManager.setContext(loggerContext as Context)
    if (name) {
      this.contextManager.setContextProperty('logger', { name })
    }
  }

  @monitored
  logImplementation(
    message: string,
    messageContext?: object,
    status: StatusType = StatusType.info,
    error?: Error,
    handlingStack?: string
  ) {
    let errorContext: RawLoggerLogsEvent['error']

    if (error !== undefined && error !== null) {
      const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
      const rawError = computeRawError({
        stackTrace,
        originalError: error,
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
        source: ErrorSource.LOGGER,
        handling: ErrorHandling.HANDLED,
        startClocks: clocksNow(),
      })

      errorContext = {
        stack: rawError.stack,
        kind: rawError.type,
        message: rawError.message,
        causes: rawError.causes,
      }
    }

    const sanitizedMessageContext = sanitize(messageContext) as Context

    const context = errorContext
      ? (combine({ error: errorContext }, sanitizedMessageContext) as Context)
      : sanitizedMessageContext

    this.handleLogStrategy(
      {
        message: sanitize(message)!,
        context,
        status,
      },
      this,
      handlingStack
    )
  }

  log(message: string, messageContext?: object, status: StatusType = StatusType.info, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(status, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, status, error, handlingStack)
  }

  setContext(context: object) {
    this.contextManager.setContext(context as Context)
  }

  getContext() {
    return this.contextManager.getContext()
  }

  setContextProperty(key: string, value: any) {
    this.contextManager.setContextProperty(key, value)
  }

  removeContextProperty(key: string) {
    this.contextManager.removeContextProperty(key)
  }

  clearContext() {
    this.contextManager.clearContext()
  }

  setHandler(handler: HandlerType | HandlerType[]) {
    this.handlerType = handler
  }

  getHandler() {
    return this.handlerType
  }

  setLevel(level: StatusType) {
    this.level = level
  }

  getLevel() {
    return this.level
  }
}

/* eslint-disable local-rules/disallow-side-effects */
Logger.prototype.ok = createLoggerMethod(StatusType.ok)
Logger.prototype.debug = createLoggerMethod(StatusType.debug)
Logger.prototype.info = createLoggerMethod(StatusType.info)
Logger.prototype.notice = createLoggerMethod(StatusType.notice)
Logger.prototype.warn = createLoggerMethod(StatusType.warn)
Logger.prototype.error = createLoggerMethod(StatusType.error)
Logger.prototype.critical = createLoggerMethod(StatusType.critical)
Logger.prototype.alert = createLoggerMethod(StatusType.alert)
Logger.prototype.emerg = createLoggerMethod(StatusType.emerg)
/* eslint-enable local-rules/disallow-side-effects */

// note: it is safe to merge declarations as long as the methods are actually defined on the prototype
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Logger {
  ok(message: string, messageContext?: object, error?: Error): void
  debug(message: string, messageContext?: object, error?: Error): void
  info(message: string, messageContext?: object, error?: Error): void
  notice(message: string, messageContext?: object, error?: Error): void
  warn(message: string, messageContext?: object, error?: Error): void
  error(message: string, messageContext?: object, error?: Error): void
  critical(message: string, messageContext?: object, error?: Error): void
  alert(message: string, messageContext?: object, error?: Error): void
  emerg(message: string, messageContext?: object, error?: Error): void
}

function createLoggerMethod(status: StatusType) {
  return function (this: Logger, message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(status, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, status, error, handlingStack)
  }
}
