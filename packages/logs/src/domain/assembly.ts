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
  getCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  const statusWithCustom = (STATUSES as string[]).concat(['custom'])
  const logRateLimiters: { [key: string]: EventRateLimiter } = {}
  statusWithCustom.forEach((status) => {
    logRateLimiters[status] = createEventRateLimiter(status, configuration.eventRateLimiterThreshold, reportError)
  })

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_LOG_COLLECTED,
    ({ rawLogsEvent, messageContext = undefined, savedCommonContext = undefined, domainContext }) => {
      const startTime = getRelativeTime(rawLogsEvent.date)
      const session = sessionManager.findTrackedSession(startTime)
      const shouldSendLog = sessionManager.findTrackedSession(startTime, { returnInactive: true })

      if (!shouldSendLog) {
        return
      }

      const commonContext = savedCommonContext || getCommonContext()

      let account

      if (!isEmptyObject(commonContext.account) && commonContext.account.id) {
        account = commonContext.account
      }

      if (session && session.anonymousId && !commonContext.user.anonymous_id) {
        commonContext.user.anonymous_id = session.anonymousId
      }
      const log = combine(
        {
          service: configuration.service,
          session_id: session ? session.id : undefined,
          session: session ? { id: session.id } : undefined,
          // Insert user and account first to allow overrides from global context
          usr: !isEmptyObject(commonContext.user) ? commonContext.user : undefined,
          account,
          view: commonContext.view,
        },
        commonContext.context,
        getRUMInternalContext(startTime),
        rawLogsEvent,
        messageContext
      )

      if (
        configuration.beforeSend?.(log, domainContext) === false ||
        (log.origin !== ErrorSource.AGENT &&
          (logRateLimiters[log.status] ?? logRateLimiters['custom']).isLimitReached())
      ) {
        return
      }

      lifeCycle.notify(LifeCycleEventType.LOG_COLLECTED, log)
    }
  )
}
