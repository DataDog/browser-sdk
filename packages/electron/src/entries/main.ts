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
import { createServer } from 'node:http'
import type { RawError, PageMayExitEvent, Encoder, InitConfiguration } from '@datadog/browser-core'
import {
  Observable,
  DeflateEncoderStreamId,
  createBatch,
  createHttpRequest,
  createFlushController,
  createIdentityEncoder,
  HookNames,
  DISCARDED,
} from '@datadog/browser-core'
import type { RumConfiguration, RumInitConfiguration } from '@datadog/browser-rum-core'
import { createHooks } from '@datadog/browser-rum-core'
import { validateAndBuildRumConfiguration } from '@datadog/browser-rum-core/cjs/domain/configuration'
import { decode } from '@msgpack/msgpack'
import type { TrackType } from '@datadog/browser-core/cjs/domain/configuration'
import { createEndpointBuilder } from '@datadog/browser-core/cjs/domain/configuration'
import tracer from '../domain/tracer'
import type { Hooks } from '../hooks'
import { createIpcMain } from '../domain/main/ipcMain'
import type { CollectedRumEvent } from '../domain/rum/events'
import { setupMainBridge } from '../domain/main/bridge'
import { startActivityTracking } from '../domain/rum/activity'
import { startRumEventAssembleAndSend } from '../domain/rum/assembly'
import { startMainProcessTracking } from '../domain/rum/mainProcessTracking'
import { startConvertSpanToRumEvent } from '../domain/rum/convertSpans'
import type { Trace } from '../domain/trace'

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

function createDdTraceAgent(onTraceObservable: Observable<Trace>, hooks: Hooks) {
  const server = createServer()

  server.on('request', (req, res) => {
    // Collect binary data chunks
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)

      const decoded = decode(buffer) as Array<
        Array<{ name: string; type: string; meta: { [key: string]: unknown }; [key: string]: unknown }>
      >

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'span' as any,
      })!

      if (defaultRumEventAttributes === DISCARDED) {
        return
      }

      for (const trace of decoded) {
        const filteredTrace = trace
          .filter((span) => !isSdkRequest(span))
          .map((span) => ({
            // rewrite id
            ...span,
            trace_id: Number(span.trace_id)?.toString(16),
            span_id: Number(span.span_id)?.toString(16),
            parent_id: Number(span.parent_id)?.toString(16),
            meta: {
              ...span.meta,
              '_dd.application.id': defaultRumEventAttributes.application!.id,
              '_dd.session.id': defaultRumEventAttributes.session!.id,
              '_dd.view.id': defaultRumEventAttributes.view!.id,
            },
          }))

        if (filteredTrace.length > 0) {
          onTraceObservable.notify(filteredTrace)
        }
      }
    })

    // Respond with the agent API format that dd-trace expects
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        rate_by_service: {
          'service:dd-trace,env:prod': 1,
        },
      })
    )
  })

  server.listen(0, () => {
    const addressInfo = server.address()
    if (!addressInfo) {
      throw new Error('Failed to get server address')
    }

    if (typeof addressInfo === 'string') {
      throw new Error(`Address is a string: ${addressInfo}`)
    }

    const { port } = addressInfo
    const url = `http://127.0.0.1:${port}`

    // console.log('agents url', url)
    tracer.setUrl(url)
  })
}

function isSdkRequest(span: any) {
  const spanRequestUrl = span.meta['http.url'] as string | undefined
  return (
    (spanRequestUrl &&
      (spanRequestUrl.startsWith('http://127.0.0.1') ||
        spanRequestUrl.startsWith('https://browser-intake-datadoghq.com/'))) ||
    (span.resource as string).startsWith('browser-intake-datadoghq.com')
  )
}
