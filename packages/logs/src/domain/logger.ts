import type { Context, ContextManager } from '@datadog/browser-core'
import {
  clocksNow,
  computeRawError,
  ErrorHandling,
  combine,
  createContextManager,
  ErrorSource,
  monitored,
  sanitize,
  NonErrorPrefix,
  createHandlingStack,
} from '@datadog/browser-core'

import { isAuthorized, StatusType } from './logger/isAuthorized'
import { createErrorFieldFromRawError } from './createErrorFieldFromRawError'

/**
 * Structure passed to the internal log handling strategy.
 *
 * @public
 */
export interface LogsMessage {
  /** Raw message provided by the customer */
  message: string
  /** Severity of the log */
  status: StatusType
  /** Optional context attached to the log */
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, no-restricted-syntax
export class Logger {
  private contextManager: ContextManager

  constructor(
    private handleLogStrategy: (logsMessage: LogsMessage, logger: Logger, handlingStack?: string) => void,
    name?: string,
    private handlerType: HandlerType | HandlerType[] = HandlerType.http,
    private level: StatusType = StatusType.debug,
    loggerContext: object = {}
  ) {
    this.contextManager = createContextManager('logger')
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
    const sanitizedMessageContext = sanitize(messageContext) as Context
    let context: Context

    if (error !== undefined && error !== null) {
      const rawError = computeRawError({
        originalError: error,
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
        source: ErrorSource.LOGGER,
        handling: ErrorHandling.HANDLED,
        startClocks: clocksNow(),
      })

      context = combine(
        {
          error: createErrorFieldFromRawError(rawError, { includeMessage: true }),
        },
        sanitizedMessageContext
      )
    } else {
      context = sanitizedMessageContext
    }

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
      handlingStack = createHandlingStack('log')
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

/**
 * Set of convenience methods for each supported log level.
 *
 * All methods accept the same parameters:
 * `message`: human-readable log text.
 * `messageContext`: optional JSON-serialisable object merged with the log context.
 * `error`: optional `Error` instance captured with the log.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Logger {
  /** Add an OK log (success). */
  ok(message: string, messageContext?: object, error?: Error): void
  /** Add a DEBUG log (developer usage). */
  debug(message: string, messageContext?: object, error?: Error): void
  /** Add an INFO log (notable but expected). */
  info(message: string, messageContext?: object, error?: Error): void
  /** Add a NOTICE log (normal but significant). */
  notice(message: string, messageContext?: object, error?: Error): void
  /** Add a WARN log (unexpected behaviour). */
  warn(message: string, messageContext?: object, error?: Error): void
  /** Add an ERROR log (runtime error). */
  error(message: string, messageContext?: object, error?: Error): void
  /** Add a CRITICAL log (serious failure). */
  critical(message: string, messageContext?: object, error?: Error): void
  /** Add an ALERT log (action must be taken immediately). */
  alert(message: string, messageContext?: object, error?: Error): void
  /** Add an EMERGENCY log (system is unusable). */
  emerg(message: string, messageContext?: object, error?: Error): void
}

function createLoggerMethod(status: StatusType) {
  return function (this: Logger, message: string, messageContext?: object, error?: Error) {
    let handlingStack: string | undefined

    if (isAuthorized(status, HandlerType.http, this)) {
      handlingStack = createHandlingStack('log')
    }

    this.logImplementation(message, messageContext, status, error, handlingStack)
  }
}
