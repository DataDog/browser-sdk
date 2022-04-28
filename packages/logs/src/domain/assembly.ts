import type { Context, EventRateLimiter, RawError, RelativeTime } from '@datadog/browser-core'
import { ErrorSource, combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { Logger } from './logger'
import { STATUSES, HandlerType } from './logger'
import { isAuthorized } from './logsCollection/logger/loggerCollection'
import type { LogsSessionManager } from './logsSessionManager'
import { reportAgentError } from './reportAgentError'

export function startLogsAssembly(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  getCommonContext: () => CommonContext,
  mainLogger: Logger // Todo: [RUMF-1230] Remove this parameter in the next major release
) {
  const statusWithCustom = (STATUSES as string[]).concat(['custom'])
  const logRateLimiters: { [key: string]: EventRateLimiter } = {}
  statusWithCustom.forEach((status) => {
    logRateLimiters[status] = createEventRateLimiter(
      status,
      configuration.eventRateLimiterThreshold,
      (error: RawError) => reportAgentError(error, lifeCycle)
    )
  })

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_LOG_COLLECTED,
    ({ rawLogsEvent, messageContext = undefined, savedCommonContext = undefined, logger = mainLogger }) => {
      const startTime = getRelativeTime(rawLogsEvent.date)
      const session = sessionManager.findTrackedSession(startTime)

      if (!session) {
        return
      }

      const commonContext = savedCommonContext || getCommonContext()
      const log = combine(
        { service: configuration.service, session_id: session.id, view: commonContext.view },
        commonContext.context,
        getRUMInternalContext(startTime),
        rawLogsEvent,
        logger.getContext(),
        messageContext
      )

      if (
        // Todo: [RUMF-1230] Move this check to the logger collection in the next major release
        !isAuthorized(rawLogsEvent.status, HandlerType.http, logger) ||
        configuration.beforeSend?.(log) === false ||
        (log.error?.origin !== ErrorSource.AGENT &&
          (logRateLimiters[log.status] ?? logRateLimiters['custom']).isLimitReached())
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
