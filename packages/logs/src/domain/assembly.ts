import type { Context, RawError, RelativeTime } from '@datadog/browser-core'
import { combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { LoggerOptions } from './logger'
import { HandlerType, StatusType } from './logger'
import { isAuthorized } from './logsCollection/logger/loggerCollection'
import type { LogsSessionManager } from './logsSessionManager'
import { reportRawError } from './reportRawError'

export function startLogsAssembly(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  getCommonContext: () => CommonContext,
  mainLoggerOptions: LoggerOptions // Todo: [RUMF-1230] Remove this parameter in the next major release
) {
  const reportAgentError = (error: RawError) => reportRawError(error, lifeCycle)

  const logRateLimiters = {
    [StatusType.error]: createEventRateLimiter(
      StatusType.error,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    [StatusType.warn]: createEventRateLimiter(
      StatusType.warn,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    [StatusType.info]: createEventRateLimiter(
      StatusType.info,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    [StatusType.debug]: createEventRateLimiter(
      StatusType.debug,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    ['custom']: createEventRateLimiter('custom', configuration.eventRateLimiterThreshold, reportAgentError),
  }

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_LOG_COLLECTED,
    ({ rawLog, messageContext = undefined, commonContext = getCommonContext(), loggerOptions = mainLoggerOptions }) => {
      const startTime = rawLog.date ? getRelativeTime(rawLog.date) : undefined
      const session = sessionManager.findTrackedSession(startTime)
      const loggerContext = loggerOptions.contextManager.get()

      if (!session) {
        return
      }

      const log = combine(
        { service: configuration.service, session_id: session.id },
        loggerContext,
        commonContext,
        getRUMInternalContext(startTime),
        messageContext,
        rawLog
      )

      if (
        configuration.beforeSend?.(log) === false ||
        (logRateLimiters[log.status] ?? logRateLimiters['custom']).isLimitReached()
      ) {
        return
      }

      // Todo: [RUMF-1230] Move this check to the logger collection in the next major release
      if (isAuthorized(rawLog.status, HandlerType.http, loggerOptions)) {
        lifeCycle.notify(LifeCycleEventType.LOG_COLLECTED, log)
      }
    }
  )
}

interface Rum {
  getInternalContext: (startTime?: RelativeTime) => Context
}

export function getRUMInternalContext(startTime?: RelativeTime): Context | undefined {
  const rum = (window as any).DD_RUM as Rum
  return rum && rum.getInternalContext ? rum.getInternalContext(startTime) : undefined
}
