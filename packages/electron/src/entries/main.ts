import crypto from 'node:crypto'
import type { RumConfiguration, RumInitConfiguration } from '@datadog/browser-rum-core'
import { createHooks, validateAndBuildRumConfiguration } from '@datadog/browser-rum-core'
import type { LogsEvent } from '@datadog/browser-logs'
import type {
  PageMayExitEvent,
  AbstractHooks,
  RawError,
  Encoder,
  InitConfiguration,
  TrackType,
} from '@datadog/browser-core'
import {
  monitor,
  createBatch,
  createHttpRequest,
  createFlushController,
  createEndpointBuilder,
  buildGlobalContextManager,
  Observable,
  createIdentityEncoder,
  HookNames,
  setInterval,
} from '@datadog/browser-core'
import tracer, { initTracer } from '../domain/trace/tracer'
import { createIpcMain } from '../domain/main/ipcMain'
import type { CollectedRumEvent } from '../domain/rum/events'
import { setupMainBridge } from '../domain/main/bridge'
import { startActivityTracking } from '../domain/rum/activity'
import { startRumEventAssembleAndSend } from '../domain/rum/assembly'
import { startMainProcessTracking } from '../domain/rum/mainProcessTracking'
import { startConvertSpanToRumEvent } from '../domain/rum/convertSpans'
import { startCrashMonitoring } from '../domain/rum/crashReporter'
import type { Trace } from '../domain/trace/trace'
import { createDdTraceAgent } from '../domain/trace/traceAgent'
import { startLogsEventAssembleAndSend } from '../domain/logs/assembly'
import { startTelemetry } from '../domain/telemetry/telemetry'

function makeDatadogElectron() {
  const globalContext = buildGlobalContextManager()

  return {
    init(initConfiguration: RumInitConfiguration) {
      console.log('init from SDK Electron')

      const configuration = validateAndBuildRumConfiguration(initConfiguration)

      if (!configuration) {
        return
      }

      const pageMayExitObservable = new Observable<PageMayExitEvent>()
      const sessionExpireObservable = new Observable<void>()
      const onRumEventObservable = new Observable<CollectedRumEvent>()
      const onLogsEventObservable = new Observable<LogsEvent>()
      const onTraceObservable = new Observable<Trace>()
      const hooks = createHooks()
      const sessionId = crypto.randomUUID()
      const mainProcessViewId = crypto.randomUUID()

      ;(hooks as AbstractHooks).register(HookNames.Assemble, () => {
        const context = globalContext.getContext()
        return { context }
      })

      const rumBatch = startElectronRumBatch(
        configuration,
        reportError,
        pageMayExitObservable,
        sessionExpireObservable,
        createIdentityEncoder
      )
      startRumEventAssembleAndSend(onRumEventObservable, rumBatch, hooks)
      startTelemetry(rumBatch, configuration, hooks)

      const logsBatch = startElectronLogsBatch(
        configuration,
        reportError,
        pageMayExitObservable,
        sessionExpireObservable,
        createIdentityEncoder
      )
      startLogsEventAssembleAndSend(onLogsEventObservable, logsBatch, hooks)

      const spanBatch = startElectronSpanBatch(
        initConfiguration,
        reportError,
        pageMayExitObservable,
        sessionExpireObservable,
        createIdentityEncoder
      )
      onTraceObservable.subscribe((trace) => {
        spanBatch.add({ env: 'prod', spans: trace })
      })

      const onActivityObservable = startActivityTracking(onRumEventObservable)
      startMainProcessTracking(
        hooks,
        configuration,
        sessionId,
        mainProcessViewId,
        onRumEventObservable,
        onActivityObservable
      )
      startConvertSpanToRumEvent(onTraceObservable, onRumEventObservable)
      setupMainBridge(onRumEventObservable, onLogsEventObservable)
      startCrashMonitoring(onRumEventObservable, initConfiguration.applicationId, sessionId, mainProcessViewId)

      initTracer(configuration.service!, configuration.env!, configuration.version!)
      createDdTraceAgent(onTraceObservable, hooks)

      setInterval(() => {
        pageMayExitObservable.notify({ reason: 'page_hide' })
      }, 1000)
    },
    setGlobalContext: monitor(globalContext.setContext.bind(globalContext)),
    getGlobalContext: monitor(globalContext.getContext.bind(globalContext)),
    setGlobalContextProperty: monitor(globalContext.setContextProperty.bind(globalContext)),
    removeGlobalContextProperty: monitor(globalContext.removeContextProperty.bind(globalContext)),
    clearGlobalContext: monitor(globalContext.clearContext.bind(globalContext)),
  }
}

export const ddElectron = makeDatadogElectron()
export { tracer }
export const ipcMain = createIpcMain()

export function startElectronRumBatch(
  configuration: RumConfiguration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  createEncoder: () => Encoder
) {
  const batch = createBatch({
    encoder: createEncoder(),
    request: createHttpRequest([configuration.rumEndpointBuilder], reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable,
    }),
  })

  return batch
}

export function startElectronLogsBatch(
  configuration: RumConfiguration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  createEncoder: () => Encoder
) {
  const batch = createBatch({
    encoder: createEncoder(),
    request: createHttpRequest([configuration.logsEndpointBuilder], reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable,
    }),
  })

  return batch
}

// TODO change it by a single event fetch
export function startElectronSpanBatch(
  initConfiguration: InitConfiguration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  createEncoder: () => Encoder
) {
  const batch = createBatch({
    encoder: createEncoder(),
    request: createHttpRequest([createEndpointBuilder(initConfiguration, 'spans' as TrackType)], reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable,
    }),
  })

  return batch
}

function reportError() {
  console.error('Error reporting to Datadog')
}
