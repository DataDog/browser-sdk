import type { Context, RawError } from '@datadog/browser-core'
import { DISCARDED, ErrorSource, HookNames, buildTags, combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { DecoratorFactory, DecoratorResult } from '@datadog/browser-core-next'
import type { LogsEvent } from '../../logsEvent.types'
import type { LogsConfiguration } from '../configuration'
import type { Hooks } from '../hooks'
import { STATUSES } from '../logger'
import type { CommonContext } from '../../rawLogsEvent.types'
import type { LogsObservation } from './logsPipelineEvents'

export interface AssembledLogAttributes {
  assembledLog: LogsEvent & Context
}

export function createAssemblyDecoratorFactory(
  configuration: LogsConfiguration,
  hooks: Hooks,
  getCommonContext: () => CommonContext,
  reportError: (error: RawError) => void,
  eventRateLimit?: number
): DecoratorFactory<LogsObservation, AssembledLogAttributes> {
  const statusWithCustom = (STATUSES as string[]).concat(['custom'])
  const logRateLimiters: { [key: string]: ReturnType<typeof createEventRateLimiter> } = {}
  statusWithCustom.forEach((status) => {
    logRateLimiters[status] = createEventRateLimiter(status, reportError, eventRateLimit)
  })

  return {
    name: 'assembly',
    provides: [],
    requires: [],
    capabilities: { canDiscard: true },
    create(_deps) {
      return {
        async decorate(
          observation: LogsObservation,
          _accumulated: Readonly<Partial<AssembledLogAttributes>>
        ): Promise<DecoratorResult<AssembledLogAttributes>> {
          const { rawLogsEvent, messageContext, savedCommonContext, domainContext, ddtags = [] } = observation.data

          const commonContext = savedCommonContext || getCommonContext()
          const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
            startTime: observation.startTime,
          })

          if (defaultLogsEventAttributes === DISCARDED) {
            return { status: 'discarded', reason: 'tracking consent not granted or no session' }
          }

          const defaultDdtags = buildTags(configuration)

          const log = combine(
            {
              view: commonContext.view,
            },
            defaultLogsEventAttributes,
            rawLogsEvent,
            messageContext,
            {
              ddtags: defaultDdtags.concat(ddtags).join(','),
            }
          ) as LogsEvent & Context

          if (
            configuration.beforeSend?.(log, domainContext) === false ||
            (log.origin !== ErrorSource.AGENT &&
              (logRateLimiters[log.status] ?? logRateLimiters['custom']).isLimitReached())
          ) {
            return { status: 'discarded', reason: 'beforeSend returned false or rate limit reached' }
          }

          return { status: 'contributed', attributes: { assembledLog: log } }
        },
      }
    },
  }
}
