import type { Context, ClocksState, Observable, BufferedData } from '@datadog/browser-core'
import { noop, ErrorSource, BufferedDataType } from '@datadog/browser-core'
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
  bufferedDataObservable: Observable<BufferedData>
) {
  if (!configuration.forwardErrorsToLogs) {
    return { stop: noop }
  }

  const rawErrorSubscription = bufferedDataObservable.subscribe((bufferedData) => {
    if (bufferedData.type === BufferedDataType.RUNTIME_ERROR) {
      const error = bufferedData.error
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
