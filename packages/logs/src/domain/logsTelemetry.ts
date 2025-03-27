import type { RawError, Observable, PageMayExitEvent, Context } from '@datadog/browser-core'
import {
  startTelemetry,
  TelemetryService,
  addTelemetryConfiguration,
  startTelemetryTransport,
  drainPreStartTelemetry,
} from '@datadog/browser-core'
import type { LogsConfiguration, LogsInitConfiguration } from './configuration'
import { getRUMInternalContext } from './contexts/rumInternalContext'
import type { LogsSessionManager } from './logsSessionManager'
import { serializeLogsConfiguration } from './configuration'

export function startLogsTelemetry(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  session: LogsSessionManager
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

  const { stop } = startTelemetryTransport(
    configuration,
    reportError,
    pageMayExitObservable,
    session.expireObservable,
    telemetry.observable
  )
  drainPreStartTelemetry()
  addTelemetryConfiguration(serializeLogsConfiguration(initConfiguration))
  return {
    stop,
  }
}
