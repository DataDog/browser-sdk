import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import { noop, ErrorSource, trackRuntimeError, Observable } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startRuntimeErrorCollection(configuration: LogsConfiguration, lifeCycle: LifeCycle) {
  if (!configuration.forwardErrorsToLogs) {
    return { stop: noop }
  }

  const rawErrorObservable = new Observable<RawError>()

  const { stop: stopRuntimeErrorTracking } = trackRuntimeError(rawErrorObservable)

  const rawErrorSubscription = rawErrorObservable.subscribe((rawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        date: rawError.startClocks.timeStamp,
        message: rawError.message,
        status: StatusType.error,
        error: {
          kind: rawError.type,
          stack: rawError.stack,
          causes: rawError.causes,
        },
        origin: ErrorSource.SOURCE,
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
