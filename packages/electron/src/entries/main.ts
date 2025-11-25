/* eslint-disable jsdoc/check-indentation */
import type { RawError, PageMayExitEvent, Encoder, InitConfiguration, TrackType } from '@datadog/browser-core'
import {
  Observable,
  createBatch,
  createHttpRequest,
  createFlushController,
  createIdentityEncoder,
  createEndpointBuilder,
} from '@datadog/browser-core'
import type { RumConfiguration, RumInitConfiguration } from '@datadog/browser-rum-core'
import { createHooks, validateAndBuildRumConfiguration } from '@datadog/browser-rum-core'
import type { LogsEvent } from '@datadog/browser-logs'
import tracer, { initTracer } from '../domain/trace/tracer'
import { createIpcMain } from '../domain/main/ipcMain'
import type { CollectedRumEvent } from '../domain/rum/events'
import { setupMainBridge } from '../domain/main/bridge'
import { startActivityTracking } from '../domain/rum/activity'
import { startRumEventAssembleAndSend } from '../domain/rum/assembly'
import { startMainProcessTracking } from '../domain/rum/mainProcessTracking'
import { startConvertSpanToRumEvent } from '../domain/rum/convertSpans'
import type { Trace } from '../domain/trace/trace'
import { createDdTraceAgent } from '../domain/trace/traceAgent'
import { startLogsEventAssembleAndSend } from '../domain/logs/assembly'

function makeDatadogElectron() {
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

      const rumBatch = startElectronRumBatch(
        configuration,
        reportError,
        pageMayExitObservable,
        sessionExpireObservable,
        createIdentityEncoder
      )
      startRumEventAssembleAndSend(onRumEventObservable, rumBatch, hooks)

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
      startMainProcessTracking(hooks, configuration, onRumEventObservable, onActivityObservable)
      startConvertSpanToRumEvent(onTraceObservable, onRumEventObservable)
      setupMainBridge(onRumEventObservable, onLogsEventObservable)

      initTracer(configuration.service!, configuration.env!, configuration.version!)
      createDdTraceAgent(onTraceObservable, hooks)

      // eslint-disable-next-line
      setInterval(() => {
        pageMayExitObservable.notify({ reason: 'page_hide' })
      }, 1000)
    },
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
