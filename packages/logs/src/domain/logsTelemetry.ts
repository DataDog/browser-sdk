import type { RawError, Observable, PageExitEvent, TelemetryEvent } from '@datadog/browser-core'
import {
  startTelemetry,
  TelemetryService,
  canUseEventBridge,
  getEventBridge,
  startBatchWithReplica,
  createIdentityEncoder,
  isTelemetryReplicationAllowed,
} from '@datadog/browser-core'
import type { LogsConfiguration } from './configuration'

export function startLogsTelemetry(
  configuration: LogsConfiguration,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>,
  sessionExpireObservable: Observable<void>
) {
  const telemetry = startTelemetry(TelemetryService.LOGS, configuration)
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
      sessionExpireObservable
    )
    cleanupTasks.push(() => telemetryBatch.stop())
    const telemetrySubscription = telemetry.observable.subscribe((event) =>
      telemetryBatch.add(event, isTelemetryReplicationAllowed(configuration))
    )
    cleanupTasks.push(() => telemetrySubscription.unsubscribe())
  }
  return {
    telemetry,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}
