import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import { noop, ErrorSource, trackRuntimeError, Observable } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger'
import { LogsComponents } from '../../boot/logsComponents'

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
startRuntimeErrorCollection.$id = LogsComponents.RuntimeErrorCollection
startRuntimeErrorCollection.$deps = [LogsComponents.Configuration, LogsComponents.LifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
