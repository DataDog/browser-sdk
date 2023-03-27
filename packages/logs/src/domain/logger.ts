import type { Context } from '@datadog/browser-core'
import {
  CustomerDataType,
  isExperimentalFeatureEnabled,
  clocksNow,
  computeRawError,
  ErrorHandling,
  PROVIDED_ERROR_MESSAGE_PREFIX,
  computeStackTrace,
  deepClone,
  assign,
  combine,
  createContextManager,
  ErrorSource,
  monitored,
  sanitize,
} from '@datadog/browser-core'

import type { LogsEvent } from '../logsEvent.types'

export interface LogsMessage {
  message: string
  status: StatusType
  context?: Context
}

export const StatusType = {
  debug: 'debug',
  error: 'error',
  info: 'info',
  warn: 'warn',
} as const

export type StatusType = (typeof StatusType)[keyof typeof StatusType]

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const

export type HandlerType = (typeof HandlerType)[keyof typeof HandlerType]
export const STATUSES = Object.keys(StatusType) as StatusType[]

export class Logger {
  private contextManager = createContextManager(CustomerDataType.LoggerContext)

  constructor(
    private handleLogStrategy: (logsMessage: LogsMessage, logger: Logger) => void,
    name?: string,
    private handlerType: HandlerType | HandlerType[] = HandlerType.http,
    private level: StatusType = StatusType.debug,
    loggerContext: object = {}
  ) {
    this.contextManager.set(assign({}, loggerContext, name ? { logger: { name } } : undefined))
  }

  @monitored
  log(message: string, messageContext?: object, status: StatusType = StatusType.info, error?: Error) {
    let errorContext: LogsEvent['error']

    if (status === StatusType.error) {
      // Always add origin if status is error (backward compatibility - Remove in next major)
      errorContext = { origin: ErrorSource.LOGGER }
    }

    if (error !== undefined && error !== null) {
      const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
      const rawError = computeRawError({
        stackTrace,
        originalError: error,
        nonErrorPrefix: PROVIDED_ERROR_MESSAGE_PREFIX,
        source: ErrorSource.LOGGER,
        handling: ErrorHandling.HANDLED,
        startClocks: clocksNow(),
      })

      errorContext = {
        origin: ErrorSource.LOGGER, // Remove in next major
        stack: rawError.stack,
        kind: rawError.type,
        message: rawError.message,
      }
    }

    const sanitizedMessageContext = (
      isExperimentalFeatureEnabled('sanitize_inputs') ? sanitize(messageContext) : deepClone(messageContext)
    ) as Context

    const context = errorContext
      ? (combine({ error: errorContext }, sanitizedMessageContext) as Context)
      : sanitizedMessageContext

    this.handleLogStrategy(
      { message: isExperimentalFeatureEnabled('sanitize_inputs') ? sanitize(message)! : message, context, status },
      this
    )
  }

  debug(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.debug, error)
  }

  info(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.info, error)
  }

  warn(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.warn, error)
  }

  error(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.error, error)
  }

  setContext(context: object) {
    this.contextManager.set(context)
  }

  getContext() {
    return this.contextManager.get()
  }

  addContext(key: string, value: any) {
    this.contextManager.add(key, value)
  }

  removeContext(key: string) {
    this.contextManager.remove(key)
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
