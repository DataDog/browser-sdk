import type { TrackingConsentState } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageMayExitObservable,
  willSyntheticsInjectRum,
  canUseEventBridge,
  display,
  Observable,
} from '@datadog/browser-core'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { startLogsAssembly } from '../domain/assembly'
import { startConsoleCollection } from '../domain/console/consoleCollection'
import { startReportCollection } from '../domain/report/reportCollection'
import { startNetworkErrorCollection } from '../domain/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/runtimeError/runtimeErrorCollection'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startLoggerCollection } from '../domain/logger/loggerCollection'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsBridge } from '../transport/startLogsBridge'
import { startInternalContext } from '../domain/contexts/internalContext'
import { startReportError } from '../domain/reportError'
import { startLogsTelemetry } from '../domain/logsTelemetry'
import type { CommonContext } from '../rawLogsEvent.types'
import type { PageMayExitEvent } from '@datadog/browser-core'

export type StartLogs = typeof startLogs
export type StartLogsResult = ReturnType<StartLogs>

/**
 * Detects if running in a Service Worker environment
 */
function isServiceWorkerEnvironment(): boolean {
  return typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self;
}

export function startLogs(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  getCommonContext: () => CommonContext,

  // `startLogs` and its subcomponents assume tracking consent is granted initially and starts
  // collecting logs unconditionally. As such, `startLogs` should be called with a
  // `trackingConsentState` set to "granted".
  trackingConsentState: TrackingConsentState
) {
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []
  const isServiceWorker = isServiceWorkerEnvironment();
  
  if (isServiceWorker) {
    display.info('Logs SDK initialized in Service Worker environment');
  }

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => {
    try {
      if (!isServiceWorker) {
        sendToExtension('logs', log);
      }
    } catch (e) {
      // Silently fail if extension communication fails
    }
  })

  const reportError = startReportError(lifeCycle)
  
  const pageMayExitObservable = isServiceWorker
    ? new Observable<PageMayExitEvent>() // Empty observable for Service Workers
    : createPageMayExitObservable(configuration)

  const shouldUseServiceWorkerStrategy = isServiceWorker &&
      configuration.sessionStoreStrategyType?.type === 'service-worker';
  
  const session = shouldUseServiceWorkerStrategy || 
      (configuration.sessionStoreStrategyType && !canUseEventBridge() && !willSyntheticsInjectRum())
      ? startLogsSessionManager(configuration, trackingConsentState)
      : startLogsSessionManagerStub(configuration)

  const { stop: stopLogsTelemetry } = startLogsTelemetry(
    initConfiguration,
    configuration,
    reportError,
    pageMayExitObservable,
    session
  )
  cleanupTasks.push(() => stopLogsTelemetry())

  // Safely wrap components that might depend on browser features
  try {
    startNetworkErrorCollection(configuration, lifeCycle)
  } catch (e) {
    if (!isServiceWorker) {
      throw e;
    }
    display.info('Network error collection unavailable in this Service Worker environment');
  }
  
  try {
    startRuntimeErrorCollection(configuration, lifeCycle)
  } catch (e) {
    if (!isServiceWorker) {
      throw e;
    }
    display.info('Runtime error collection unavailable in this Service Worker environment');
  }
  
  startConsoleCollection(configuration, lifeCycle)
  
  try {
    startReportCollection(configuration, lifeCycle)
  } catch (e) {
    if (!isServiceWorker) {
      throw e;
    }
    display.info('Report collection unavailable in this Service Worker environment');
  }
  
  const { handleLog } = startLoggerCollection(lifeCycle)

  startLogsAssembly(session, configuration, lifeCycle, getCommonContext, reportError)

  if (!canUseEventBridge()) {
    const { stop: stopLogsBatch } = startLogsBatch(
      configuration,
      lifeCycle,
      reportError,
      pageMayExitObservable,
      session
    )
    cleanupTasks.push(() => stopLogsBatch())
  } else if (!isServiceWorker) {
    startLogsBridge(lifeCycle)
  }

  const internalContext = startInternalContext(session)

  return {
    handleLog,
    getInternalContext: internalContext.get,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}
