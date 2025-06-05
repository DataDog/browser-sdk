import type { RawError, Observable, PageMayExitEvent, Context } from '@datadog/browser-core'
import {
  startTelemetry,
  TelemetryService,
  drainPreStartTelemetry,
  startTelemetryTransport,
} from '@datadog/browser-core'
import type { LogsConfiguration } from './configuration'
import type { LogsSessionManager } from './logsSessionManager'

export function startLogsTelemetry(
  configuration: LogsConfiguration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  session: LogsSessionManager,
  getRUMInternalContext: () => Context | undefined
) {
  const telemetry = startTelemetry(TelemetryService.LOGS, configuration)
  telemetry.setContextProvider(() => ({
    application: {
      id: getRUMInternalContext()?.application_id,
    },
    session: {
      id: session.findTrackedSession()?.id,
    },
    view: {
      id: (getRUMInternalContext()?.view as Context)?.id,
    },
    action: {
      id: (getRUMInternalContext()?.user_action as Context)?.id,
    },
  }))

  const { stop } = startTelemetryTransport(configuration, reportError, pageMayExitObservable, telemetry.observable)
  drainPreStartTelemetry()
  return {
    stop,
  }
}
