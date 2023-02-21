import type { Context } from '@datadog/browser-core'
import {
  computeStackTrace,
  toStackTraceString,
  deepClone,
  assign,
  combine,
  createContextManager,
  ErrorSource,
  monitored,
} from '@datadog/browser-core'

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

export type StatusType = typeof StatusType[keyof typeof StatusType]

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const

export type HandlerType = typeof HandlerType[keyof typeof HandlerType]
export const STATUSES = Object.keys(StatusType) as StatusType[]

export const NO_ERROR_STACK_PRESENT_MESSAGE = 'No stack, consider using an instance of Error'
export const PROVIDED_ERROR_MESSAGE_PREFIX = 'Provided:'

export class Logger {
  private contextManager = createContextManager()

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
    let context: Context

    if (status === StatusType.error || (error !== undefined && error !== null)) {
      // Always add origin if status is error (backward compatibility), or we have an actual error
      const errorContext = { error: { origin: ErrorSource.LOGGER } as Context }

      // Extract information from error object if provided
      if (error instanceof Error) {
        const stackTrace = computeStackTrace(error)
        errorContext.error.kind = stackTrace.name
        errorContext.error.message = stackTrace.message
        errorContext.error.stack = toStackTraceString(stackTrace)
        // Serialize other types if provided as error parameter
      } else if (error !== undefined && error !== null) {
        errorContext.error.message = `${PROVIDED_ERROR_MESSAGE_PREFIX} ${JSON.stringify(error, undefined, 2)}`
        errorContext.error.stack = NO_ERROR_STACK_PRESENT_MESSAGE
      }

      context = combine(errorContext, messageContext)
    } else {
      context = deepClone(messageContext) as Context
    }

    this.handleLogStrategy({ message, context, status }, this)
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
