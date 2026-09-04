import type { Context, EventRateLimiter } from '@datadog/browser-core'
import { ErrorSource, buildTags, createEventRateLimiter } from '@datadog/browser-core'
import { toRelativeTime } from '@datadog/js-core/time'
import { DISCARDED } from '@datadog/js-core/assembly'
import { combine } from '@datadog/js-core/util'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsEvent } from '../logsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { STATUSES } from './logger'
import type { Hooks, AssembleHookParams } from './hooks'

export function startLogsAssembly(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  hooks: Hooks,
  getCommonContext: () => CommonContext,
  reportError: (message: string) => void,
  eventRateLimit?: number
) {
  const statusWithCustom = (STATUSES as string[]).concat(['custom'])
  const logRateLimiters: { [key: string]: EventRateLimiter } = {}
  statusWithCustom.forEach((status) => {
    logRateLimiters[status] = createEventRateLimiter(status, reportError, eventRateLimit)
  })

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_LOG_COLLECTED,
    ({ rawLogsEvent, messageContext = undefined, savedCommonContext = undefined, domainContext, ddtags = [] }) => {
      const startTime = toRelativeTime(rawLogsEvent.date)
      const commonContext = savedCommonContext || getCommonContext()
      const assemblyParams: AssembleHookParams = {
        startTime,
        rawLogsEvent: rawLogsEvent as AssembleHookParams['rawLogsEvent'],
        domainContext,
      }
      const defaultLogsEventAttributes = hooks.assembleEventDefaults.trigger(assemblyParams)
      if (defaultLogsEventAttributes === DISCARDED) {
        return
      }

      const logsEventAttributes = hooks.assembleEvent.trigger(assemblyParams)!
      if (logsEventAttributes === DISCARDED) {
        return
      }

      const defaultDdtags = buildTags(configuration)

      const log = combine(
        {
          view: commonContext.view,
        },
        defaultLogsEventAttributes,
        rawLogsEvent,
        messageContext,
        logsEventAttributes,
        {
          ddtags: defaultDdtags.concat(ddtags).join(','),
        }
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
