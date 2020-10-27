import {
  computeStackTrace,
  Configuration,
  Context,
  ErrorMessage,
  ErrorSource,
  formatUnknownError,
  getTimestamp,
} from '@datadog/browser-core'
import { RumErrorEvent, RumEventCategory } from '../../../types'
import { RumErrorEventV2, RumEventType } from '../../../typesV2'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export interface ProvidedError {
  startTime: number
  error: unknown
  context?: Context
  source: ErrorSource
}

export function startErrorCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(
    LifeCycleEventType.ERROR_PROVIDED,
    ({ error: { error, startTime, context: customerContext, source }, context: savedGlobalContext }) => {
      const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
      const { message, stack, kind } = formatUnknownError(stackTrace, error, 'Provided')

      if (configuration.isEnabled('v2_format')) {
        const rawRumEvent: RumErrorEventV2 = {
          date: getTimestamp(startTime),
          error: {
            message,
            source,
            stack,
            type: kind,
          },
          type: RumEventType.ERROR,
        }

        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
          customerContext,
          rawRumEvent,
          savedGlobalContext,
          startTime,
        })
      } else {
        const rawRumEvent: RumErrorEvent = {
          message,
          date: getTimestamp(startTime),
          error: {
            kind,
            stack,
            origin: source,
          },
          evt: {
            category: RumEventCategory.ERROR,
          },
        }

        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
          customerContext,
          rawRumEvent,
          savedGlobalContext,
          startTime,
        })
      }
    }
  )
  lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, ({ startTime, context, message }: ErrorMessage) => {
    if (configuration.isEnabled('v2_format')) {
      const rawRumEvent: RumErrorEventV2 = {
        date: getTimestamp(startTime),
        error: {
          message,
          resource: context.http,
          source: context.error.origin,
          stack: context.error.stack,
          type: context.error.kind,
        },
        type: RumEventType.ERROR,
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent,
        startTime,
      })
    } else {
      const rawRumEvent: RumErrorEvent = {
        message,
        date: getTimestamp(startTime),
        error: context.error,
        evt: {
          category: RumEventCategory.ERROR,
        },
        http: context.http,
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent,
        startTime,
      })
    }
  })
}
