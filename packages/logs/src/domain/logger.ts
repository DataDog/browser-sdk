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

  log(message: string, messageContext?: object, status: StatusType = StatusType.info, error?: Error) {
    // note: generating the handling stack is intentionally duplicated in each of the logger method to save a frame in the stack
    let handlingStack: string | undefined

    if (isAuthorized(status, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, status, error, handlingStack)
  }

  ok(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.ok, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.ok, error, handlingStack)
  }

  debug(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.debug, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.debug, error, handlingStack)
  }

  info(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.info, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.info, error, handlingStack)
  }

  notice(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.notice, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.notice, error, handlingStack)
  }

  warn(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.warn, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.warn, error, handlingStack)
  }

  error(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.error, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.error, error, handlingStack)
  }

  critical(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.critical, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.critical, error, handlingStack)
  }

  alert(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.alert, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.alert, error, handlingStack)
  }

  emerg(message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(StatusType.emerg, HandlerType.http, this)) {
      handlingStack = createHandlingStack()
    }

    this.logImplementation(message, messageContext, StatusType.emerg, error, handlingStack)
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

  @monitored
  private logImplementation(
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
}
