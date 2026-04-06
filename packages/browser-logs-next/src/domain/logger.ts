export const StatusType = {
  ok: 'ok',
  debug: 'debug',
  info: 'info',
  notice: 'notice',
  warn: 'warn',
  error: 'error',
  critical: 'critical',
  alert: 'alert',
  emerg: 'emerg',
} as const

export type StatusType = (typeof StatusType)[keyof typeof StatusType]

export const STATUS_PRIORITIES: Record<StatusType, number> = {
  [StatusType.ok]: 0,
  [StatusType.debug]: 1,
  [StatusType.info]: 2,
  [StatusType.notice]: 3,
  [StatusType.warn]: 4,
  [StatusType.error]: 5,
  [StatusType.critical]: 6,
  [StatusType.alert]: 7,
  [StatusType.emerg]: 8,
}

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const

export type HandlerType = (typeof HandlerType)[keyof typeof HandlerType]

export interface LogsMessage {
  message: string
  status: StatusType
  context?: object
  error?: Error
}

// note: it is safe to merge declarations as long as the methods are actually defined on the prototype
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, no-restricted-syntax
export class Logger {
  private context: Record<string, unknown> = {}
  private tags: string[] = []
  private handlerType: HandlerType | HandlerType[]
  private level: StatusType

  constructor(
    private readonly handleLog: (message: LogsMessage, logger: Logger) => void,
    private readonly name: string = 'default',
    handlerType: HandlerType | HandlerType[] = HandlerType.http,
    level: StatusType = StatusType.debug,
    context: object = {}
  ) {
    this.handlerType = handlerType
    this.level = level
    this.context = { ...context }
  }

  getName(): string {
    return this.name
  }

  log(message: string, messageContext?: object, status: StatusType = StatusType.info, error?: Error): void {
    if (!this.isAuthorized(status)) {
      return
    }

    const logsMessage: LogsMessage = {
      message,
      status,
      context: messageContext ? { ...this.context, ...messageContext } : { ...this.context },
      error,
    }

    if (this.hasHandler(HandlerType.console)) {
      this.logToConsole(logsMessage)
    }

    if (this.hasHandler(HandlerType.http)) {
      this.handleLog(logsMessage, this)
    }
  }

  setContext(context: object): void {
    this.context = { ...context }
  }

  getContext(): Record<string, unknown> {
    return { ...this.context }
  }

  setContextProperty(key: string, value: unknown): void {
    this.context[key] = value
  }

  removeContextProperty(key: string): void {
    delete this.context[key]
  }

  clearContext(): void {
    this.context = {}
  }

  addTag(key: string, value?: string): void {
    this.tags.push(value !== undefined ? `${key}:${value}` : key)
  }

  removeTagsWithKey(key: string): void {
    this.tags = this.tags.filter((tag) => !tag.startsWith(`${key}:`))
  }

  getTags(): string[] {
    return [...this.tags]
  }

  setHandler(handler: HandlerType | HandlerType[]): void {
    this.handlerType = handler
  }

  getHandler(): HandlerType | HandlerType[] {
    return this.handlerType
  }

  setLevel(level: StatusType): void {
    this.level = level
  }

  getLevel(): StatusType {
    return this.level
  }

  private isAuthorized(status: StatusType): boolean {
    return STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[this.level]
  }

  private hasHandler(handler: HandlerType): boolean {
    return Array.isArray(this.handlerType) ? this.handlerType.includes(handler) : this.handlerType === handler
  }

  private logToConsole(message: LogsMessage): void {
    const consoleMethod =
      message.status === 'error' ||
      message.status === 'critical' ||
      message.status === 'alert' ||
      message.status === 'emerg'
        ? 'error'
        : message.status === 'warn' || message.status === 'notice'
          ? 'warn'
          : message.status === 'debug'
            ? 'debug'
            : 'log'

    console[consoleMethod](message.message, message.context)
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

// note: it is safe to merge declarations as long as the methods are actually defined on the prototype
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Logger {
  ok(message: string, messageContext?: object, error?: Error): void
  debug(message: string, messageContext?: object, error?: Error): void
  info(message: string, messageContext?: object, error?: Error): void
  notice(message: string, messageContext?: object, error?: Error): void
  warn(message: string, messageContext?: object, error?: Error): void
  error(message: string, messageContext?: object, error?: Error): void
  critical(message: string, messageContext?: object, error?: Error): void
  alert(message: string, messageContext?: object, error?: Error): void
  emerg(message: string, messageContext?: object, error?: Error): void
}

function createLoggerMethod(status: StatusType) {
  return function (this: Logger, message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, status, error)
  }
}
