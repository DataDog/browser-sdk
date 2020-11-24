import { combine, Context, ContextValue, createContextManager, ErrorSource, monitored } from '@datadog/browser-core'

export enum StatusType {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export type Status = 'debug' | 'info' | 'warn' | 'error'

export const STATUSES = Object.keys(StatusType)

export interface LogsMessage {
  message: string
  status: Status
  [key: string]: ContextValue
}

export enum HandlerType {
  http = 'http',
  console = 'console',
  silent = 'silent',
}

export type Handler = 'http' | 'console' | 'silent'

export class Logger {
  private contextManager = createContextManager()

  constructor(
    private sendLog: (message: LogsMessage) => void,
    private handlerType: Handler = HandlerType.http,
    private level: Status = StatusType.debug,
    loggerContext: Context = {}
  ) {
    this.contextManager.set(loggerContext)
  }

  @monitored
  log(message: string, messageContext?: Context, status: Status = StatusType.info) {
    if (STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[this.level]) {
      switch (this.handlerType) {
        case HandlerType.http:
          this.sendLog({
            message,
            status,
            ...combine(this.contextManager.get(), messageContext),
          })
          break
        case HandlerType.console:
          console.log(`${status}: ${message}`, combine(this.contextManager.get(), messageContext))
          break
        case HandlerType.silent:
          break
      }
    }
  }

  debug(message: string, messageContext?: Context) {
    this.log(message, messageContext, StatusType.debug)
  }

  info(message: string, messageContext?: Context) {
    this.log(message, messageContext, StatusType.info)
  }

  warn(message: string, messageContext?: Context) {
    this.log(message, messageContext, StatusType.warn)
  }

  error(message: string, messageContext?: Context) {
    const errorOrigin = {
      error: {
        origin: ErrorSource.LOGGER,
      },
    }
    this.log(message, combine(errorOrigin, messageContext), StatusType.error)
  }

  setContext(context: Context) {
    this.contextManager.set(context)
  }

  addContext(key: string, value: ContextValue) {
    this.contextManager.add(key, value)
  }

  removeContext(key: string) {
    this.contextManager.remove(key)
  }

  setHandler(handler: Handler) {
    this.handlerType = handler
  }

  setLevel(level: Status) {
    this.level = level
  }
}
