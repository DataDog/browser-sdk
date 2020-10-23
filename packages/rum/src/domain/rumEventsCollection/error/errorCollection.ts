import {
  computeStackTrace,
  Configuration,
  Context,
  ErrorSource,
  formatUnknownError,
  getTimestamp,
} from '@datadog/browser-core'
import { RumErrorEvent, RumEventCategory } from '../../../types'
import { RumErrorEventV2, RumEventType } from '../../../typesV2'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export interface ManuallyAddedError {
  startTime: number
  error: unknown
  context?: Context
  source: ErrorSource
}

export function startManualErrorCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(
    LifeCycleEventType.MANUAL_ERROR_COLLECTED,
    ({ error: { error, startTime, context: customerContext, source }, context: savedGlobalContext }) => {
      const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
      const { message, stack, kind } = formatUnknownError(stackTrace, error, 'Captured')

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
}
