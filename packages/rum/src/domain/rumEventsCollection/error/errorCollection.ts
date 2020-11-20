import {
  computeStackTrace,
  Configuration,
  Context,
  ErrorSource,
  formatUnknownError,
  getTimestamp,
  Observable,
  RawError,
  startAutomaticErrorCollection,
} from '@datadog/browser-core'
import { RumErrorEventV2, RumEventType } from '../../../typesV2'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export interface ProvidedError {
  startTime: number
  error: unknown
  context?: Context
  source: ErrorSource
}

export function startErrorCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  return doStartErrorCollection(lifeCycle, configuration, startAutomaticErrorCollection(configuration))
}

export function doStartErrorCollection(
  lifeCycle: LifeCycle,
  configuration: Configuration,
  observable: Observable<RawError>
) {
  observable.subscribe((error) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, processErrorV2(error))
  )

  return {
    addError({ error, startTime, context: customerContext, source }: ProvidedError, savedGlobalContext?: Context) {
      const rawError = computeRawError(error, startTime, source)
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        customerContext,
        savedGlobalContext,
        ...processErrorV2(rawError),
      })
    },
  }
}

function computeRawError(error: unknown, startTime: number, source: ErrorSource): RawError {
  const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
  return { startTime, source, ...formatUnknownError(stackTrace, error, 'Provided') }
}

function processErrorV2(error: RawError) {
  const rawRumEvent: RumErrorEventV2 = {
    date: getTimestamp(error.startTime),
    error: {
      message: error.message,
      resource: error.resource,
      source: error.source,
      stack: error.stack,
      type: error.type,
    },
    type: RumEventType.ERROR as const,
  }

  return {
    rawRumEvent,
    startTime: error.startTime,
  }
}
