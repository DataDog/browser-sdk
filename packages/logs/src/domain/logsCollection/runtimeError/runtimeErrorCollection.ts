import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import { trackRuntimeError, Observable } from '@datadog/browser-core'
import type { LogsConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { reportRawError } from '../../reportRawError'

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

  const rawErrorSubscription = rawErrorObservable.subscribe((rawError) => reportRawError(rawError, lifeCycle))

  return {
    stop: () => {
      rawErrorSubscription.unsubscribe()
    },
  }
}
