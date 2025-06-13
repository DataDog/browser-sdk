import type { Context, ClocksState, Observable, EarlyData } from '@datadog/browser-core'
import { noop, ErrorSource, EarlyDataType } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'
import { createErrorFieldFromRawError } from '../createErrorFieldFromRawError'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startRuntimeErrorCollection(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  earlyDataObservable: Observable<EarlyData>
) {
  if (!configuration.forwardErrorsToLogs) {
    return { stop: noop }
  }

  const rawErrorSubscription = earlyDataObservable.subscribe((earlyData) => {
    if (earlyData.type === EarlyDataType.RUNTIME_ERROR) {
      const error = earlyData.error
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: {
          message: error.message,
          date: error.startClocks.timeStamp,
          error: createErrorFieldFromRawError(error),
          origin: ErrorSource.SOURCE,
          status: StatusType.error,
        },
        messageContext: error.context,
      })
    }
  })

  return {
    stop: () => {
      rawErrorSubscription.unsubscribe()
    },
  }
}
