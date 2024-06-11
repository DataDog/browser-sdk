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

  // plaheholders for type definition, the actual implementation is done in the prototype level
  ok(_message: string, _messageContext?: object, _error?: Error): void {}
  debug(_message: string, _messageContext?: object, _error?: Error): void {}
  info(_message: string, _messageContext?: object, _error?: Error): void {}
  notice(_message: string, _messageContext?: object, _error?: Error): void {}
  warn(_message: string, _messageContext?: object, _error?: Error): void {}
  error(_message: string, _messageContext?: object, _error?: Error): void {}
  critical(_message: string, _messageContext?: object, _error?: Error): void {}
  alert(_message: string, _messageContext?: object, _error?: Error): void {}
  emerg(_message: string, _messageContext?: object, _error?: Error): void {}

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

function createLoggerMethod(status: StatusType) {
  return function (this: Logger, message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(status, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, status, error, handlingStack)
  }
}
