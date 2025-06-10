import type { Context, EventRateLimiter, RawError } from '@datadog/browser-core'
import { ErrorSource, HookNames, combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsEvent } from '../logsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { STATUSES } from './logger'
import type { LogsSessionManager } from './logsSessionManager'
import type { DefaultLogsEventAttributes, Hooks } from './hooks'

export function startLogsAssembly(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  hooks: Hooks,
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
      const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime,
      }) as DefaultLogsEventAttributes

      const log = combine(
        {
          service: configuration.service,
          session_id: session ? session.id : undefined,
          session: session ? { id: session.id } : undefined,
          view: commonContext.view,
        },
        defaultLogsEventAttributes,
        rawLogsEvent,
        messageContext
      ) as LogsEvent & Context

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
