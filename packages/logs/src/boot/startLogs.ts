import type { Context, TelemetryEvent } from '@datadog/browser-core'
import {
  willSyntheticsInjectRum,
  areCookiesAuthorized,
  canUseEventBridge,
  getEventBridge,
  startTelemetry,
  startBatchWithReplica,
  isTelemetryReplicationAllowed,
} from '@datadog/browser-core'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration } from '../domain/configuration'
import { startLogsAssembly, getRUMInternalContext } from '../domain/assembly'
import { startConsoleCollection } from '../domain/logsCollection/console/consoleCollection'
import { startReportCollection } from '../domain/logsCollection/report/reportCollection'
import { startNetworkErrorCollection } from '../domain/logsCollection/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/logsCollection/runtimeError/runtimeErrorCollection'
import { LifeCycle } from '../domain/lifeCycle'
import { startLoggerCollection } from '../domain/logsCollection/logger/loggerCollection'
import type { CommonContext } from '../rawLogsEvent.types'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsBridge } from '../transport/startLogsBridge'
import type { Logger } from '../domain/logger'

export function startLogs(configuration: LogsConfiguration, getCommonContext: () => CommonContext, mainLogger: Logger) {
  const lifeCycle = new LifeCycle()

  const telemetry = startLogsTelemetry(configuration)
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

  startNetworkErrorCollection(configuration, lifeCycle)
  startRuntimeErrorCollection(configuration, lifeCycle)
  startConsoleCollection(configuration, lifeCycle)
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)

  const session =
    areCookiesAuthorized(configuration.cookieOptions) && !canUseEventBridge() && !willSyntheticsInjectRum()
      ? startLogsSessionManager(configuration)
      : startLogsSessionManagerStub(configuration)

  startLogsAssembly(session, configuration, lifeCycle, getCommonContext, mainLogger)

  if (!canUseEventBridge()) {
    startLogsBatch(configuration, lifeCycle)
  } else {
    startLogsBridge(lifeCycle)
  }

  return {
    handleLog,
  }
}

function startLogsTelemetry(configuration: LogsConfiguration) {
  const telemetry = startTelemetry(configuration)
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_telemetry', TelemetryEvent>()!
    telemetry.observable.subscribe((event) => bridge.send('internal_telemetry', event))
  } else {
    const telemetryBatch = startBatchWithReplica(
      configuration,
      configuration.rumEndpointBuilder,
      configuration.replica?.rumEndpointBuilder
    )
    telemetry.observable.subscribe((event) => telemetryBatch.add(event, isTelemetryReplicationAllowed(configuration)))
  }
  return telemetry
}
