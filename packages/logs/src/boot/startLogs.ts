import type { Context, TelemetryEvent, RawError, Observable, PageExitEvent } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageExitObservable,
  TelemetryService,
  willSyntheticsInjectRum,
  canUseEventBridge,
  getEventBridge,
  startTelemetry,
  startBatchWithReplica,
  isTelemetryReplicationAllowed,
  addTelemetryConfiguration,
  createIdentityEncoder,
} from '@datadog/browser-core'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { serializeLogsConfiguration } from '../domain/configuration'
import { startLogsAssembly, getRUMInternalContext } from '../domain/assembly'
import { startConsoleCollection } from '../domain/console/consoleCollection'
import { startReportCollection } from '../domain/report/reportCollection'
import { startNetworkErrorCollection } from '../domain/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/runtimeError/runtimeErrorCollection'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startLoggerCollection } from '../domain/logger/loggerCollection'
import type { CommonContext } from '../rawLogsEvent.types'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsBridge } from '../transport/startLogsBridge'
import { startInternalContext } from '../domain/internalContext'
import { startReportError } from '../domain/reportError'

export function startLogs(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  buildCommonContext: () => CommonContext
) {
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)
  const pageExitObservable = createPageExitObservable(configuration)

  const session =
    configuration.sessionStoreStrategyType && !canUseEventBridge() && !willSyntheticsInjectRum()
      ? startLogsSessionManager(configuration)
      : startLogsSessionManagerStub(configuration)

  const { telemetry, stop: stopLogsTelemetry } = startLogsTelemetry(
    configuration,
    reportError,
    pageExitObservable,
    session.expireObservable
  )
  cleanupTasks.push(() => stopLogsTelemetry())
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

  startLogsAssembly(session, configuration, lifeCycle, buildCommonContext, reportError)

  if (!canUseEventBridge()) {
    const { stop: stopLogsBatch } = startLogsBatch(
      configuration,
      lifeCycle,
      reportError,
      pageExitObservable,
      session.expireObservable
    )
    cleanupTasks.push(() => stopLogsBatch())
  } else {
    startLogsBridge(lifeCycle)
  }

  addTelemetryConfiguration(serializeLogsConfiguration(initConfiguration))
  const internalContext = startInternalContext(session)

  return {
    handleLog,
    getInternalContext: internalContext.get,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

function startLogsTelemetry(
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
