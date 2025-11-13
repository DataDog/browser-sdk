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
import {
  type RawError,
  type PageMayExitEvent,
  type Encoder,
  type Context,
  type InitConfiguration,
  computeRawError,
  clocksNow,
  NonErrorPrefix,
  dateNow,
  Observable,
  DeflateEncoderStreamId,
  createBatch,
  createHttpRequest,
  createFlushController,
  createIdentityEncoder,
  combine,
  ErrorHandling,
  generateUUID,
} from '@datadog/browser-core'
import type { RumConfiguration, RumEvent, RumInitConfiguration } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { validateAndBuildRumConfiguration } from '@datadog/browser-rum-core/cjs/domain/configuration'
import type { Batch } from '@datadog/browser-core/cjs/transport/batch'
import { decode } from '@msgpack/msgpack'
import type { TrackType } from '@datadog/browser-core/cjs/domain/configuration'
import { createEndpointBuilder } from '@datadog/browser-core/cjs/domain/configuration'
import type { RumViewEvent } from '@datadog/browser-rum'
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

      function sendRumEvent(event: RumEvent) {
        if (event.type === RumEventType.VIEW) {
          rumBatch.upsert(event as unknown as Context, event.view.id)
        } else {
          rumBatch.add(event as unknown as Context)
        }
      }

      startMainProcessTracking(sendRumEvent, configuration)

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
      setupIpcHandlers(sendRumEvent, configuration)
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

function setupIpcHandlers(sendRumEvent: (event: RumEvent) => void, configuration: RumConfiguration) {
  ipcMain.handle('datadog:send', (_event, msg: string) => {
    const serverRumEvent = JSON.parse(msg) as BridgeEvent

    if (serverRumEvent.eventType !== 'rum') {
      console.log('not a rum event', serverRumEvent)

      return
    }

    const rumEvent = serverRumEvent.event
    rumEvent.session.id = sessionId
    rumEvent.application.id = configuration.applicationId

    sendRumEvent(rumEvent)
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
        // console.log('trace', trace)
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

    // console.log('agents url', url)
    tracer.setUrl(url)
  })
}

function startMainProcessTracking(sendRumEvent: (event: RumEvent) => void, configuration: RumConfiguration) {
  // To have a view id for events generated from main process
  const mainProcessContext = {
    // TODO source electron
    source: 'browser' as const,
    application: {
      id: configuration.applicationId,
    },
    session: {
      id: sessionId,
      type: 'user' as const,
    },
    _dd: {
      format_version: 2 as const,
    },
  }
  const applicationLaunch = {
    type: RumEventType.VIEW,
    date: dateNow(),
    view: {
      id: crypto.randomUUID(),
      name: 'ApplicationLaunch',
      // TODO get customer package name
      url: 'com/datadog/application-launch/view',
      // TODO update it
      time_spent: 0,
      action: {
        count: 0,
      },
      resource: {
        count: 0,
      },
      error: {
        count: 0,
      },
    },
    _dd: {
      // TODO update it
      document_version: 1,
    },
  } as RumViewEvent

  // TODO activity tracking
  // TODO session expiration / renewal
  // TODO useragent

  sendRumEvent(combine(mainProcessContext, applicationLaunch))

  process.on('uncaughtException', (err) => {
    const error = computeRawError({
      originalError: err,
      startClocks: clocksNow(),
      nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
      source: 'source',
      handling: ErrorHandling.UNHANDLED,
    })
    const rawRumEvent = {
      type: RumEventType.ERROR,
      date: error.startClocks.timeStamp,
      error: {
        id: generateUUID(),
        message: error.message,
        stack: error.stack,
        source: error.source,
        type: error.type,
        handling: error.handling,
      },
      view: {
        id: applicationLaunch.view.id,
        url: applicationLaunch.view.url,
      },
    }
    sendRumEvent(combine(mainProcessContext, rawRumEvent))
  })
}

export { tracer }
