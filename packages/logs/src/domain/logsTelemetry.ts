import type { RawError, Observable, PageExitEvent, TelemetryEvent, Context } from '@datadog/browser-core'
import {
  startTelemetry,
  TelemetryService,
  canUseEventBridge,
  getEventBridge,
  startBatchWithReplica,
  createIdentityEncoder,
  isTelemetryReplicationAllowed,
  addTelemetryConfiguration,
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
  pageExitObservable: Observable<PageExitEvent>,
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
  const cleanupTasks: Array<() => void> = []
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_telemetry', TelemetryEvent>()!
    const telemetrySubscription = telemetry.observable.subscribe((event) => bridge.send('internal_telemetry', event))
    cleanupTasks.push(() => telemetrySubscription.unsubscribe())
  } else {
    const telemetryBatch = startBatchWithReplica(
      configuration,
      {
        endpoint: configuration.rumEndpointBuilder,
        encoder: createIdentityEncoder(),
      },
      configuration.replica && {
        endpoint: configuration.replica.rumEndpointBuilder,
        encoder: createIdentityEncoder(),
      },
      reportError,
      pageExitObservable,
      session.expireObservable
    )
    cleanupTasks.push(() => telemetryBatch.stop())
    const telemetrySubscription = telemetry.observable.subscribe((event) =>
      telemetryBatch.add(event, isTelemetryReplicationAllowed(configuration))
    )
    cleanupTasks.push(() => telemetrySubscription.unsubscribe())
  }
  drainPreStartTelemetry()
  addTelemetryConfiguration(serializeLogsConfiguration(initConfiguration))
  return {
    telemetry,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}
