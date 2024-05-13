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
  includes,
} from '@datadog/browser-core'

import type { RawLoggerLogsEvent } from '../rawLogsEvent.types'

export interface LogsMessage {
  message: string
  status: StatusType
  context?: Context
}

export const StatusType = {
  emerg: 'emerg',
  alert: 'alert',
  critical: 'critical',
  error: 'error',
  warn: 'warn',
  notice: 'notice',
  info: 'info',
  debug: 'debug',
  OK: 'OK',
} as const

export type StatusType = (typeof StatusType)[keyof typeof StatusType]

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const

export type HandlerType = (typeof HandlerType)[keyof typeof HandlerType]
export const STATUSES = Object.keys(StatusType) as StatusType[]

export const StatusMapping: {
  [key in StatusType]: { prefixes: string[]; excludedPrefixes?: string[]; priority: number }
} = {
  [StatusType.emerg]: { priority: 0, prefixes: ['f', 'emerg'] },
  [StatusType.alert]: { priority: 1, prefixes: ['a'] },
  [StatusType.critical]: { priority: 2, prefixes: ['c'] },
  [StatusType.error]: { priority: 3, prefixes: ['e'], excludedPrefixes: ['emerg'] },
  [StatusType.warn]: { priority: 4, prefixes: ['w'] },
  [StatusType.notice]: { priority: 5, prefixes: ['n'] },
  [StatusType.info]: { priority: 6, prefixes: ['i'] },
  [StatusType.debug]: { priority: 7, prefixes: ['d', 'trace', 'verbose'] },
  [StatusType.OK]: { priority: 8, prefixes: ['o', 's'] },
}

const remap = (rawStatus: string | number): StatusType => {
  if (includes(STATUSES, rawStatus)) {
    return rawStatus as StatusType
  }

  // Only map Syslog severity level numbers.
  if (typeof rawStatus === 'number' && rawStatus >= 0 && rawStatus <= 7) {
    return STATUSES[rawStatus]
  }

  if (typeof rawStatus === 'string') {
    rawStatus = rawStatus.toLowerCase()
    for (const status of STATUSES) {
      const { prefixes, excludedPrefixes } = StatusMapping[status]
      if (matchList(prefixes, rawStatus, true) && !matchList(excludedPrefixes ?? [], rawStatus, true)) {
        return status
      }
    }
  }

  return StatusType.info
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
