/* eslint-disable local-rules/enforce-prod-deps-imports */
/* eslint-disable local-rules/disallow-side-effects */
/**
 * TODO:
 * - [ ] Basic session management
 * - [x] Transport layer (for the bridge from webview, from dd-trace)
 *   - [x] handle rum events
 *   - [ ] handle routing for other type of events
 *   - [ ] handle dd-trace events (forwards APM spans to trace intake)
 * - [x] setup bridge client with ipc from webviews (renderer processes)
 * - [x] use `exposeInMainWorld` to setup the bridge function that will setup the ipc to the main process
 */
import crypto from 'node:crypto'
import { createServer } from 'node:http'
import { ipcMain } from 'electron'
import type { RawError, PageMayExitEvent, Encoder, Context, InitConfiguration } from '@datadog/browser-core'
import {
  Observable,
  DeflateEncoderStreamId,
  createBatch,
  createHttpRequest,
  createFlushController,
  createIdentityEncoder,
} from '@datadog/browser-core'
import type { AllowedRawRumEvent, RumConfiguration, RumEvent, RumInitConfiguration } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { validateAndBuildRumConfiguration } from '@datadog/browser-rum-core/cjs/domain/configuration'
import type { Batch } from '@datadog/browser-core/cjs/transport/batch'
import { decode } from '@msgpack/msgpack'
import type { TrackType } from '@datadog/browser-core/cjs/domain/configuration'
import { createEndpointBuilder } from '@datadog/browser-core/cjs/domain/configuration'
import tracer from '../tracer'

const sessionId = crypto.randomUUID()
console.log('sessionId', sessionId)

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
      setupIpcHandlers(rumBatch, configuration)
      createDdTraceAgent(spanBatch)

      setInterval(() => {
        pageMayExitObservable.notify({ reason: 'page_hide' })
      }, 1000)
    },
  }
}

export const ddElectron = makeDatadogElectron()

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

function setupIpcHandlers(batch: Batch, configuration: RumConfiguration) {
  ipcMain.handle('datadog:send', (_event, msg: string) => {
    const serverRumEvent = JSON.parse(msg) as BridgeEvent

    if (serverRumEvent.eventType !== 'rum') {
      console.log('not a rum event', serverRumEvent)

      return
    }

    serverRumEvent.event.session.id = sessionId
    serverRumEvent.event.application.id = configuration.applicationId

    if (serverRumEvent.event.type === RumEventType.VIEW) {
      batch.upsert(serverRumEvent.event as unknown as Context, serverRumEvent.event.view.id)
    } else {
      batch.add(serverRumEvent.event as unknown as Context)
    }
  })
}

interface BridgeEvent {
  eventType: 'rum'
  event: RumEvent & { session: { id: string } } & { application: { id: string } }
}

function createDdTraceAgent(batch: Batch) {
  const server = createServer()

  server.on('request', (req, res) => {
    // Collect binary data chunks
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)

      const decoded = decode(buffer) as unknown[]

      for (const trace of decoded) {
        console.log('trace', trace)
        batch.add(trace as Context)
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

    console.log('agents url', url)
    tracer.setUrl(url)
  })
}

export { tracer }
