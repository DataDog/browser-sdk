import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import { ErrorSource, trackRuntimeError, Observable } from '@datadog/browser-core'
import type { RawRuntimeLogsEvent } from '../../../rawLogsEvent.types'
import type { LogsConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startRuntimeErrorCollection(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  rawErrorObservable = new Observable<RawError>()
) {
  if (configuration.forwardErrorsToLogs) {
    trackRuntimeError(rawErrorObservable)
  }

  const rawErrorSubscription = rawErrorObservable.subscribe((rawError) => {
    lifeCycle.notify<RawRuntimeLogsEvent>(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        message: rawError.message,
        date: rawError.startClocks.timeStamp,
        error: {
          kind: rawError.type,
          origin: ErrorSource.SOURCE, // Todo: Remove in the next major release
          stack: rawError.stack,
        },
        origin: ErrorSource.SOURCE,
        status: StatusType.error,
      },
    })
  })

  return {
    stop: () => {
      rawErrorSubscription.unsubscribe()
    },
  }
}
