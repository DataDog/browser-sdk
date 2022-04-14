import type { Context, RawError, RelativeTime } from '@datadog/browser-core'
import { ErrorSource, combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { Logger } from './logger'
import { HandlerType, StatusType } from './logger'
import { isAuthorized } from './logsCollection/logger/loggerCollection'
import type { LogsSessionManager } from './logsSessionManager'
import { reportRawError } from './reportRawError'

export function startLogsAssembly(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  getCommonContext: () => CommonContext,
  mainLogger: Logger // Todo: [RUMF-1230] Remove this parameter in the next major release
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
    ({ rawLog, messageContext = undefined, savedCommonContext = undefined, logger = mainLogger }) => {
      const startTime = rawLog.date ? getRelativeTime(rawLog.date) : undefined
      const session = sessionManager.findTrackedSession(startTime)

      if (!session) {
        return
      }

      const commonContext = savedCommonContext || getCommonContext()
      const log = combine(
        { service: configuration.service, session_id: session.id },
        { date: commonContext.date, view: commonContext.view },
        commonContext.context,
        getRUMInternalContext(startTime),
        rawLog,
        logger.getContext(),
        messageContext
      )

      if (
        configuration.beforeSend?.(log) === false ||
        (log.error?.origin !== ErrorSource.AGENT &&
          (logRateLimiters[log.status] ?? logRateLimiters['custom']).isLimitReached()) ||
        // Todo: [RUMF-1230] Move this check to the logger collection in the next major release
        !isAuthorized(rawLog.status, HandlerType.http, logger)
      ) {
        return
      }

      lifeCycle.notify(LifeCycleEventType.LOG_COLLECTED, log)
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
