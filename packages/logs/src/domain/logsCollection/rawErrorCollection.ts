import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import { Observable, trackRuntimeError } from '@datadog/browser-core'
import type { LogsEvent } from '../../logsEvent.types'
import type { LogsConfiguration } from '../configuration'
import { StatusType } from '../logger'
import type { Sender } from '../sender'
import { trackNetworkError } from '../trackNetworkError'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startRawErrorCollection(
  configuration: LogsConfiguration,
  sender: Sender,
  rawErrorObservable = new Observable<RawError>()
) {
  if (configuration.forwardErrorsToLogs) {
    trackRuntimeError(rawErrorObservable)
    trackNetworkError(configuration, rawErrorObservable)
  }

  const rawErrorSubscription = rawErrorObservable.subscribe(reportRawError)

  function reportRawError(error: RawError) {
    const messageContext: Partial<LogsEvent> = {
      date: error.startClocks.timeStamp,
      error: {
        kind: error.type,
        origin: error.source,
        stack: error.stack,
      },
    }
    if (error.resource) {
      messageContext.http = {
        method: error.resource.method as any, // Cast resource method because of case mismatch cf issue RUMF-1152
        status_code: error.resource.statusCode,
        url: error.resource.url,
      }
    }
    sender.sendToHttp(error.message, messageContext, StatusType.error)
  }

  return {
    reportRawError,
    stop: () => {
      rawErrorSubscription.unsubscribe()
    },
  }
}
