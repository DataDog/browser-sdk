import type { Context } from '@datadog/browser-core'
import { deepClone, assign, combine, createContextManager, ErrorSource, monitored } from '@datadog/browser-core'

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

export class Logger {
  private contextManager = createContextManager()

  constructor(
    private handleLogStrategy: (logsMessage: LogsMessage, logger: Logger) => void,
    name?: string,
    private handlerType: HandlerType | HandlerType[] = HandlerType.http,
    private level: StatusType = StatusType.debug,
    loggerContext: object = {}
  ) {
    this.contextManager.setContext(assign({}, loggerContext, name ? { logger: { name } } : undefined))
  }

  @monitored
  log(message: string, messageContext?: object, status: StatusType = StatusType.info) {
    this.handleLogStrategy({ message, context: deepClone(messageContext) as Context, status }, this)
  }

  debug(message: string, messageContext?: object) {
    this.log(message, messageContext, StatusType.debug)
  }

  info(message: string, messageContext?: object) {
    this.log(message, messageContext, StatusType.info)
  }

  warn(message: string, messageContext?: object) {
    this.log(message, messageContext, StatusType.warn)
  }

  error(message: string, messageContext?: object) {
    const errorOrigin = {
      error: {
        origin: ErrorSource.LOGGER,
      },
    }
    this.log(message, combine(errorOrigin, messageContext), StatusType.error)
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

  /**
   * @deprecated use setContextProperty instead
   */
  addContext(key: string, value: any) {
    this.setContextProperty(key, value)
  }

  removeContextProperty(key: string) {
    this.contextManager.removeContextProperty(key)
  }

  /**
   * @deprecated use removeContextProperty instead
   */
  removeContext(key: string) {
    this.removeContextProperty(key)
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
