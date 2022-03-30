import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import { trackRuntimeError, Observable } from '@datadog/browser-core'
import type { LogsConfiguration } from '../../configuration'
import { reportRawError } from '../../reportRawError'
import type { Sender } from '../../sender'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startRuntimeErrorCollection(
  configuration: LogsConfiguration,
  sender: Sender,
  rawErrorObservable = new Observable<RawError>()
) {
  if (configuration.forwardErrorsToLogs) {
    trackRuntimeError(rawErrorObservable)
  }

  const rawErrorSubscription = rawErrorObservable.subscribe((rawError) => reportRawError(rawError, sender))

  return {
    stop: () => {
      rawErrorSubscription.unsubscribe()
    },
  }
}
