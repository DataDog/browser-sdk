import { combine, Context, ContextValue, ErrorOrigin, monitored } from '@datadog/browser-core'

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

export enum HandlerType {
  http = 'http',
  console = 'console',
  silent = 'silent',
}

export class Logger {
  constructor(
    private sendLog: (message: LogsMessage) => void,
    private handlerType = HandlerType.http,
    private level = StatusType.debug,
    private loggerContext: Context = {}
  ) {}

  @monitored
  log(message: string, messageContext?: Context, status = StatusType.info) {
    if (STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[this.level]) {
      switch (this.handlerType) {
        case HandlerType.http:
          this.sendLog({
            message,
            status,
            ...combine({}, this.loggerContext, messageContext),
          })
          break
        case HandlerType.console:
          console.log(`${status}: ${message}`)
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
        origin: ErrorOrigin.LOGGER,
      },
    }
    this.log(message, combine({}, errorOrigin, messageContext), StatusType.error)
  }

  setContext(context: Context) {
    this.loggerContext = context
  }

  addContext(key: string, value: ContextValue) {
    this.loggerContext[key] = value
  }

  removeContext(key: string) {
    delete this.loggerContext[key]
  }

  setHandler(handler: HandlerType) {
    this.handlerType = handler
  }

  setLevel(level: StatusType) {
    this.level = level
  }
}
