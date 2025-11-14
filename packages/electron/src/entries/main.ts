/* eslint-disable local-rules/enforce-prod-deps-imports */
/* eslint-disable local-rules/disallow-side-effects */
/**
 * TODO:
 * - [ ] Basic session management
 * - [x] Transport layer (for the bridge from webview, from dd-trace)
 *   - [x] handle rum events
 *   - [ ] handle routing for other type of events
 *   - [x] handle dd-trace events (forwards APM spans to trace intake)
 * - [x] setup bridge client with ipc from webviews (renderer processes)
 * - [x] use `exposeInMainWorld` to setup the bridge function that will setup the ipc to the main process
 */
import type { RawError, PageMayExitEvent, Encoder, InitConfiguration } from '@datadog/browser-core'
import {
  Observable,
  DeflateEncoderStreamId,
  createBatch,
  createHttpRequest,
  createFlushController,
  createIdentityEncoder,
} from '@datadog/browser-core'
import type { RumConfiguration, RumInitConfiguration } from '@datadog/browser-rum-core'
import { createHooks } from '@datadog/browser-rum-core'
import { validateAndBuildRumConfiguration } from '@datadog/browser-rum-core/cjs/domain/configuration'
import type { TrackType } from '@datadog/browser-core/cjs/domain/configuration'
import { createEndpointBuilder } from '@datadog/browser-core/cjs/domain/configuration'
import tracer from '../domain/trace/tracer'
import { createIpcMain } from '../domain/main/ipcMain'
import type { CollectedRumEvent } from '../domain/rum/events'
import { setupMainBridge } from '../domain/main/bridge'
import { startActivityTracking } from '../domain/rum/activity'
import { startRumEventAssembleAndSend } from '../domain/rum/assembly'
import { startMainProcessTracking } from '../domain/rum/mainProcessTracking'
import { startConvertSpanToRumEvent } from '../domain/rum/convertSpans'
import type { Trace } from '../domain/trace/trace'
import { createDdTraceAgent } from '../domain/trace/traceAgent'

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
      const onTraceObservable = new Observable<Trace>()
      const hooks = createHooks()
      const createEncoder = () => createIdentityEncoder()

      const rumBatch = startElectronRumBatch(
        configuration,
        () => {
          console.error('Error reporting to Datadog')
        },
        pageMayExitObservable,
        sessionExpireObservable,
        createEncoder
      )

      startRumEventAssembleAndSend(onRumEventObservable, rumBatch, hooks)
      const onActivityObservable = startActivityTracking(onRumEventObservable)
      startMainProcessTracking(hooks, configuration, onRumEventObservable, onActivityObservable)
      startConvertSpanToRumEvent(onTraceObservable, onRumEventObservable)

      const spanBatch = startElectronSpanBatch(
        initConfiguration,
        configuration,
        () => {
          console.error('Error reporting to Datadog')
        },
        pageMayExitObservable,
        sessionExpireObservable,
        createEncoder
      )
      onTraceObservable.subscribe((trace) => {
        spanBatch.add({ env: 'prod', spans: trace })
      })
      setupMainBridge(onRumEventObservable)
      createDdTraceAgent(onTraceObservable, hooks)

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
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
) {
  const batch = createBatch({
    encoder: createEncoder(DeflateEncoderStreamId.RUM),
    request: createHttpRequest([configuration.rumEndpointBuilder], configuration.batchBytesLimit, reportError),
    flushController: createFlushController({
      messagesLimit: configuration.batchMessagesLimit,
      bytesLimit: configuration.batchBytesLimit,
      durationLimit: configuration.flushTimeout,
      pageMayExitObservable,
      sessionExpireObservable,
    }),
    messageBytesLimit: configuration.messageBytesLimit,
  })

  return batch
}

// TODO change it by a single event fetch
export function startElectronSpanBatch(
  initConfiguration: InitConfiguration,
  configuration: RumConfiguration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
) {
  const endpoints = [createEndpointBuilder(initConfiguration, 'spans' as TrackType)]

  const batch = createBatch({
    encoder: createEncoder(DeflateEncoderStreamId.RUM),
    request: createHttpRequest(endpoints, configuration.batchBytesLimit, reportError),
    flushController: createFlushController({
      messagesLimit: configuration.batchMessagesLimit,
      bytesLimit: configuration.batchBytesLimit,
      durationLimit: configuration.flushTimeout,
      pageMayExitObservable,
      sessionExpireObservable,
    }),
    messageBytesLimit: configuration.messageBytesLimit,
  })

  return batch
}
