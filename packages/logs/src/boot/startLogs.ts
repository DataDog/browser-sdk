import type { Context, TelemetryEvent, RawError, Observable, PageExitEvent } from '@datadog/browser-core'
import {
  createPageExitObservable,
  TelemetryService,
  willSyntheticsInjectRum,
  areCookiesAuthorized,
  canUseEventBridge,
  getEventBridge,
  startTelemetry,
  startBatchWithReplica,
  isTelemetryReplicationAllowed,
  ErrorSource,
  addTelemetryConfiguration,
} from '@datadog/browser-core'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { serializeLogsConfiguration } from '../domain/configuration'
import { startLogsAssembly, getRUMInternalContext } from '../domain/assembly'
import { startConsoleCollection } from '../domain/logsCollection/console/consoleCollection'
import { startReportCollection } from '../domain/logsCollection/report/reportCollection'
import { startNetworkErrorCollection } from '../domain/logsCollection/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/logsCollection/runtimeError/runtimeErrorCollection'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startLoggerCollection } from '../domain/logsCollection/logger/loggerCollection'
import type { CommonContext, RawAgentLogsEvent } from '../rawLogsEvent.types'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsBridge } from '../transport/startLogsBridge'
import type { Logger } from '../domain/logger'
import { StatusType } from '../domain/logger'
import { startInternalContext } from '../domain/internalContext'

export function startLogs(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  getCommonContext: () => CommonContext,
  mainLogger: Logger
) {
  const lifeCycle = new LifeCycle()

  const reportError = (error: RawError) =>
    lifeCycle.notify<RawAgentLogsEvent>(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        message: error.message,
        date: error.startClocks.timeStamp,
        error: {
          origin: ErrorSource.AGENT, // Todo: Remove in the next major release
        },
        origin: ErrorSource.AGENT,
        status: StatusType.error,
      },
    })
  const pageExitObservable = createPageExitObservable()
  const telemetry = startLogsTelemetry(configuration, reportError, pageExitObservable)
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

  startLogsAssembly(session, configuration, lifeCycle, getCommonContext, mainLogger, reportError)

  if (!canUseEventBridge()) {
    startLogsBatch(configuration, lifeCycle, reportError, pageExitObservable)
  } else {
    startLogsBridge(lifeCycle)
  }

  addTelemetryConfiguration(serializeLogsConfiguration(initConfiguration))
  const internalContext = startInternalContext(session)

  return {
    handleLog,
    getInternalContext: internalContext.get,
  }
}

function startLogsTelemetry(
  configuration: LogsConfiguration,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>
) {
  const telemetry = startTelemetry(TelemetryService.LOGS, configuration)
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_telemetry', TelemetryEvent>()!
    telemetry.observable.subscribe((event) => bridge.send('internal_telemetry', event))
  } else {
    const telemetryBatch = startBatchWithReplica(
      configuration,
      configuration.rumEndpointBuilder,
      reportError,
      pageExitObservable,
      configuration.replica?.rumEndpointBuilder
    )
    telemetry.observable.subscribe((event) => telemetryBatch.add(event, isTelemetryReplicationAllowed(configuration)))
  }
  return telemetry
}
