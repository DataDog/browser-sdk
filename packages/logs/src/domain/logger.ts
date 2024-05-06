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
  matchList,
  includesItem,
} from '@datadog/browser-core'

import type { RawLoggerLogsEvent } from '../rawLogsEvent.types'

export interface LogsMessage {
  message: string
  status: StatusType
  context?: Context
}

export const StatusType = {
  OK: 'OK',
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

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const

export type HandlerType = (typeof HandlerType)[keyof typeof HandlerType]
export const STATUSES = Object.keys(StatusType) as StatusType[]

export const StatusMapping: { [key in StatusType]: { match: (v: string) => boolean; priority: number } } = {
  [StatusType.emerg]: { priority: 0, match: (v) => matchList(['f', 'emerg'], v, true) },
  [StatusType.alert]: { priority: 1, match: (v) => matchList(['a'], v, true) },
  [StatusType.critical]: { priority: 2, match: (v) => matchList(['c'], v, true) },
  [StatusType.error]: { priority: 3, match: (v) => matchList(['e'], v, true) && !matchList(['emerg'], v, true) },
  [StatusType.warn]: { priority: 4, match: (v) => matchList(['w'], v, true) },
  [StatusType.notice]: { priority: 5, match: (v) => matchList(['n'], v, true) },
  [StatusType.info]: { priority: 6, match: (v) => matchList(['i'], v, true) },
  [StatusType.debug]: { priority: 7, match: (v) => matchList(['d', 'trace', 'verbose'], v, true) },
  [StatusType.OK]: { priority: 8, match: (v) => matchList(['o', 's'], v, true) || matchList(['ok', 'success'], v) },
}

const remap = (rawStatus: string | number): StatusType => {
  if (includesItem(STATUSES, rawStatus)) {
    return rawStatus
  }

  for (const status of STATUSES) {
    const { match, priority } = StatusMapping[status]
    if (typeof rawStatus === 'string') {
      if (match(rawStatus.toLowerCase())) {
        return status
      }
    } else if (rawStatus >= 0 && rawStatus <= 7 && rawStatus === priority) {
      return status
    }
  }

  return 'info'
}

export class Logger {
  private contextManager: ContextManager

  constructor(
    private handleLogStrategy: (logsMessage: LogsMessage, logger: Logger) => void,
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

  @monitored
  log(message: string, messageContext?: object, status: string | number = StatusType.info, error?: Error): void {
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
        status: remap(status),
      },
      this
    )
  }

  OK(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.OK, error)
  }

  debug(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.debug, error)
  }

  info(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.info, error)
  }

  notice(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.notice, error)
  }

  warn(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.warn, error)
  }

  error(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.error, error)
  }

  critical(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.critical, error)
  }

  alert(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.alert, error)
  }

  emerg(message: string, messageContext?: object, error?: Error) {
    this.log(message, messageContext, StatusType.emerg, error)
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
