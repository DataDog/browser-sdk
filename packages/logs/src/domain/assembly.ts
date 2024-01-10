import type { EventRateLimiter, RawError } from '@datadog/browser-core'
import { ErrorSource, combine, createEventRateLimiter, getRelativeTime, isEmptyObject } from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { STATUSES } from './logger'
import type { LogsSessionManager } from './logsSessionManager'
import { getRUMInternalContext } from './contexts/rumInternalContext'

export function startLogsAssembly(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  buildCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  const statusWithCustom = (STATUSES as string[]).concat(['custom'])
  const logRateLimiters: { [key: string]: EventRateLimiter } = {}
  statusWithCustom.forEach((status) => {
    logRateLimiters[status] = createEventRateLimiter(status, configuration.eventRateLimiterThreshold, reportError)
  })

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_LOG_COLLECTED,
    ({ rawLogsEvent, messageContext = undefined, savedCommonContext = undefined }) => {
      const startTime = getRelativeTime(rawLogsEvent.date)
      const session = sessionManager.findTrackedSession(startTime)

      if (!session) {
        return
      }

      const commonContext = savedCommonContext || buildCommonContext()
      const log = combine(
        {
          service: configuration.service,
          session_id: session.id,
          // Insert user first to allow overrides from global context
          usr: !isEmptyObject(commonContext.user) ? commonContext.user : undefined,
          view: commonContext.view,
        },
        commonContext.context,
        getRUMInternalContext(startTime),
        rawLogsEvent,
        messageContext
      )

      if (
        configuration.beforeSend?.(log) === false ||
        (log.origin !== ErrorSource.AGENT &&
          (logRateLimiters[log.status] ?? logRateLimiters['custom']).isLimitReached())
      ) {
        return
      }

      lifeCycle.notify(LifeCycleEventType.LOG_COLLECTED, log)
    }
  )
}
