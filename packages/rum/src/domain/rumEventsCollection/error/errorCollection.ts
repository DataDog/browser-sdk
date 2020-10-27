import {
  combine,
  computeStackTrace,
  Configuration,
  Context,
  ErrorSource,
  formatUnknownError,
  getTimestamp,
  RawError,
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
      const rawError = computeRawError(error, startTime, source)

      configuration.isEnabled('v2_format')
        ? lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
            customerContext,
            savedGlobalContext,
            ...processErrorV2(rawError),
          })
        : lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
            customerContext,
            savedGlobalContext,
            ...processError(rawError),
          })
    }
  )
  lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, (error: RawError) => {
    configuration.isEnabled('v2_format')
      ? lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, processErrorV2(error))
      : lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processError(error))
  })
}

function computeRawError(error: unknown, startTime: number, source: ErrorSource): RawError {
  const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
  return { startTime, source, ...formatUnknownError(stackTrace, error, 'Provided') }
}

function processError(error: RawError) {
  const rawRumEvent: RumErrorEvent = combine(
    {
      date: getTimestamp(error.startTime),
      error: {
        kind: error.type,
        origin: error.source,
        stack: error.stack,
      },
      evt: {
        category: RumEventCategory.ERROR as const,
      },
      message: error.message,
    },
    error.source === ErrorSource.NETWORK
      ? {
          http: {
            method: error.method,
            status_code: error.statusCode,
            url: error.url,
          },
        }
      : undefined
  )
  return {
    rawRumEvent,
    startTime: error.startTime,
  }
}

function processErrorV2(error: RawError) {
  const rawRumEvent: RumErrorEventV2 = combine(
    {
      date: getTimestamp(error.startTime),
      error: {
        message: error.message,
        source: error.source,
        stack: error.stack,
        type: error.type,
      },
      type: RumEventType.ERROR as const,
    },
    error.source === ErrorSource.NETWORK
      ? {
          error: {
            resource: {
              method: error.method,
              statusCode: error.statusCode,
              url: error.url,
            },
          },
        }
      : undefined
  )
  return {
    rawRumEvent,
    startTime: error.startTime,
  }
}
