import { assign, TimeStamp } from '@datadog/browser-core'
import { combine, createContextManager, ErrorSource, monitored } from '@datadog/browser-core'

export interface LogsMessage {
  message: string
  status: StatusType
  date?: TimeStamp
  context?: object
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
  constructor(
    private options: LoggerOptions,
    private addLogStrategy: (logsMessage: LogsMessage, loggerOptions: LoggerOptions) => void
  ) {}

  @monitored
  log(message: string, messageContext?: object, status: StatusType = StatusType.info) {
    this.addLogStrategy({ message, context: messageContext, status }, this.options)
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
        // Todo: remove error origin in the next major version
        origin: ErrorSource.LOGGER,
      },
    }
    this.log(message, combine(errorOrigin, messageContext), StatusType.error)
  }

  setContext(context: object) {
    this.options.contextManager.set(context)
  }

  addContext(key: string, value: any) {
    this.options.contextManager.add(key, value)
  }

  removeContext(key: string) {
    this.options.contextManager.remove(key)
  }

  setHandler(handler: HandlerType | HandlerType[]) {
    this.options.handlerType = handler
  }

  setLevel(level: StatusType) {
    this.options.level = level
  }
}

export type LoggerOptions = ReturnType<typeof newLoggerOptions>

export function newLoggerOptions(
  name?: string,
  handlerType: HandlerType | HandlerType[] = HandlerType.http,
  level: StatusType = StatusType.debug,
  context: object = {}
) {
  const contextManager = createContextManager()
  // Todo: merge the logger name into the context in logger collection in next major version
  contextManager.set(assign({}, context, { logger: { name } }))

  return {
    handlerType,
    level,
    name,
    contextManager,
  }
}
