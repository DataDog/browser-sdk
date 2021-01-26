import { combine, Context, ContextValue, createContextManager, ErrorSource, monitored } from '@datadog/browser-core'

export const StatusType = {
  debug: 'debug',
  error: 'error',
  info: 'info',
  warn: 'warn',
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type StatusType = typeof StatusType[keyof typeof StatusType]

const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export const STATUSES = Object.keys(StatusType) as StatusType[]

export interface LogsMessage {
  message: string
  status: StatusType
  [key: string]: ContextValue
}

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type HandlerType = typeof HandlerType[keyof typeof HandlerType]

export class Logger {
  private contextManager = createContextManager()

  constructor(
    private sendLog: (message: LogsMessage) => void,
    private handlerType: HandlerType = HandlerType.http,
    private level: StatusType = StatusType.debug,
    loggerContext: Context = {}
  ) {
    this.contextManager.set(loggerContext)
  }

  @monitored
  log(message: string, messageContext?: object, status: StatusType = StatusType.info) {
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
    this.contextManager.set(context)
  }

  addContext(key: string, value: any) {
    this.contextManager.add(key, value)
  }

  removeContext(key: string) {
    this.contextManager.remove(key)
  }

  setHandler(handler: HandlerType) {
    this.handlerType = handler
  }

  setLevel(level: StatusType) {
    this.level = level
  }
}
