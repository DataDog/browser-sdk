import type { Context, RawError, ClocksState, Component } from '@datadog/browser-core'
import { noop, ErrorSource, trackRuntimeError, Observable } from '@datadog/browser-core'
import { getLogsConfiguration, type LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType, startLogsLifeCycle } from '../lifeCycle'
import { StatusType } from '../logger'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export const startRuntimeErrorCollection: Component<void, [LogsConfiguration, LifeCycle]> = (
  configuration,
  lifeCycle
) => {
  if (!configuration.forwardErrorsToLogs) {
    return { stop: noop }
  }

  const rawErrorObservable = new Observable<RawError>()

  const { stop: stopRuntimeErrorTracking } = trackRuntimeError(rawErrorObservable)

  const rawErrorSubscription = rawErrorObservable.subscribe((rawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        message: rawError.message,
        date: rawError.startClocks.timeStamp,
        error: {
          kind: rawError.type,
          stack: rawError.stack,
        },
        origin: ErrorSource.SOURCE,
        status: StatusType.error,
      },
    })
  })

  return {
    stop: () => {
      stopRuntimeErrorTracking()
      rawErrorSubscription.unsubscribe()
    },
  }
}
/* eslint-disable local-rules/disallow-side-effects */
startRuntimeErrorCollection.$deps = [getLogsConfiguration, startLogsLifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
