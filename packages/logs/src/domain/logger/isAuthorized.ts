import { includes } from '@datadog/browser-core'
import type { Logger, HandlerType } from '../logger'

export function isAuthorized(status: StatusType, handlerType: HandlerType, logger: Logger) {
  const loggerHandler = logger.getHandler()
  const sanitizedHandlerType = Array.isArray(loggerHandler) ? loggerHandler : [loggerHandler]
  return (
    STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[logger.getLevel()] && includes(sanitizedHandlerType, handlerType)
  )
}

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

export const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.ok]: 0,
  [StatusType.debug]: 1,
  [StatusType.info]: 2,
  [StatusType.notice]: 4,
  [StatusType.warn]: 5,
  [StatusType.error]: 6,
  [StatusType.critical]: 7,
  [StatusType.alert]: 8,
  [StatusType.emerg]: 9,
}

export type StatusType = (typeof StatusType)[keyof typeof StatusType]
