import type { Context, RawError } from '@datadog/browser-core'
import { DISCARDED, ErrorSource, HookNames, buildTags, combine } from '@datadog/browser-core'
import type { DecoratorFactory, DecoratorResult } from '@datadog/browser-core-next'
import type { LogsEvent } from '../../logsEvent.types'
import type { LogsConfiguration } from '../configuration'
import type { Hooks } from '../hooks'
import type { CommonContext } from '../../rawLogsEvent.types'
import type { LogsObservation } from './logsPipelineEvents'

export interface AssembledLogAttributes {
  assembledLog: LogsEvent & Context
}

export function createAssemblyDecoratorFactory(
  configuration: LogsConfiguration,
  hooks: Hooks,
  getCommonContext: () => CommonContext,
  // NOTE: reportError is kept as a parameter for future use when rate limiting is
  // re-added to this decorator (Task 13, after old assembly path is removed).
  _reportError: (error: RawError) => void
): DecoratorFactory<LogsObservation, AssembledLogAttributes> {
  return {
    name: 'assembly',
    provides: [],
    requires: [],
    capabilities: { canDiscard: true },
    create(_deps) {
      return {
        decorate(
          observation: LogsObservation,
          _accumulated: Readonly<Partial<AssembledLogAttributes>>
        ): Promise<DecoratorResult<AssembledLogAttributes>> {
          const { rawLogsEvent, messageContext, savedCommonContext, domainContext, ddtags = [] } = observation.data

          const commonContext = savedCommonContext || getCommonContext()
          const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
            startTime: observation.startTime,
          })

          if (defaultLogsEventAttributes === DISCARDED) {
            return Promise.resolve({ status: 'discarded', reason: 'tracking consent not granted or no session' })
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

          // NOTE: Rate limiting and beforeSend are intentionally omitted here during the
          // parallel migration period (Task 12). Both are handled by the existing
          // startLogsAssembly path. They will be re-added to this decorator in Task 13
          // when the old assembly path is removed.
          if (log.origin !== ErrorSource.AGENT && configuration.beforeSend?.(log, domainContext) === false) {
            return Promise.resolve({ status: 'discarded', reason: 'beforeSend returned false' })
          }

          return Promise.resolve({ status: 'contributed', attributes: { assembledLog: log } })
        },
      }
    },
  }
}
