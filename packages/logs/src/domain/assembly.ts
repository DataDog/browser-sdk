import type { Component, EventRateLimiter, RawError } from '@datadog/browser-core'
import { ErrorSource, combine, createEventRateLimiter, getRelativeTime, isEmptyObject } from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import { getLogsConfiguration, type LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType, startLogsLifeCycle } from './lifeCycle'
import { STATUSES } from './logger'
import { startLogsSessionManager, type LogsSessionManager } from './logsSessionManager'
import { getRUMInternalContext } from './rumInternalContext'
import { startReportError } from './reportError'
import { getBuildLogsCommonContext } from './commonContext'

export const startLogsAssembly: Component<
  void,
  [LogsSessionManager, LogsConfiguration, LifeCycle, () => CommonContext, (error: RawError) => void]
> = (sessionManager, configuration, lifeCycle, buildCommonContext, reportError) => {
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

/* eslint-disable local-rules/disallow-side-effects */
startLogsAssembly.$deps = [
  startLogsSessionManager,
  getLogsConfiguration,
  startLogsLifeCycle,
  getBuildLogsCommonContext,
  startReportError,
]
/* eslint-enable local-rules/disallow-side-effects */
