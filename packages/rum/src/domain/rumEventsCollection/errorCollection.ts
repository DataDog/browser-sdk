import { computeStackTrace, Context, ErrorSource, formatUnknownError, getTimestamp } from '@datadog/browser-core'
import { RumErrorEvent, RumEventCategory } from '../../types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'

export interface ManuallyAddedError {
  startTime: number
  error: unknown
  context?: Context
  source: ErrorSource
}

export function startManualErrorCollection(lifeCycle: LifeCycle) {
  lifeCycle.subscribe(
    LifeCycleEventType.MANUAL_ERROR_COLLECTED,
    ({ error: { error, startTime, context: customerContext, source }, context: savedGlobalContext }) => {
      const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
      const { message, stack, kind } = formatUnknownError(stackTrace, error, 'Captured')
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
  )
}
