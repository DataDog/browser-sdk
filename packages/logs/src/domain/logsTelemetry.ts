import type { RawError, Observable, PageMayExitEvent, Context } from '@datadog/browser-core'
import { startTelemetry, TelemetryService, createIdentityEncoder } from '@datadog/browser-core'
import type { LogsConfiguration } from './configuration'
import type { LogsSessionManager } from './logsSessionManager'

export function startLogsTelemetry(
  configuration: LogsConfiguration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  session: LogsSessionManager,
  getRUMInternalContext: () => Context | undefined
) {
  const telemetry = startTelemetry(
    TelemetryService.LOGS,
    configuration,
    reportError,
    pageMayExitObservable,
    createIdentityEncoder
  )
  telemetry.setContextProvider('application.id', () => getRUMInternalContext()?.application_id)
  telemetry.setContextProvider('session.id', () => session.findTrackedSession()?.id)
  telemetry.setContextProvider('view.id', () => (getRUMInternalContext()?.view as Context)?.id)
  telemetry.setContextProvider('action.id', () => (getRUMInternalContext()?.user_action as Context)?.id)
  return {
    stop: telemetry.stop,
  }
}
