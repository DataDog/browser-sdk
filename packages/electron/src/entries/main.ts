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
  elapsed,
  timeStampNow,
  computeRawError,
  clocksNow,
  NonErrorPrefix,
  Observable,
  DeflateEncoderStreamId,
  createBatch,
  createHttpRequest,
  createFlushController,
  createIdentityEncoder,
  combine,
  ErrorHandling,
  generateUUID,
  toServerDuration,
  HookNames,
  DISCARDED,
} from '@datadog/browser-core'
import {
  type RumConfiguration,
  type RumEvent,
  type RumInitConfiguration,
  createHooks,
  RumEventType,
} from '@datadog/browser-rum-core'
import { validateAndBuildRumConfiguration } from '@datadog/browser-rum-core/cjs/domain/configuration'
import type { Batch } from '@datadog/browser-core/cjs/transport/batch'
import { decode } from '@msgpack/msgpack'
import type { TrackType } from '@datadog/browser-core/cjs/domain/configuration'
import { createEndpointBuilder } from '@datadog/browser-core/cjs/domain/configuration'
import type { RumViewEvent, RumErrorEvent } from '@datadog/browser-rum'
import tracer from '../tracer'
import type { Hooks } from '../hooks'

interface CollectedRumEvent {
  source: 'main-process' | 'renderer'
  event: RumEvent
}

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

      startRumEventAssembleAndSend(configuration, onRumEventObservable, rumBatch, hooks)
      const onActivityObservable = startActivityTracking(onRumEventObservable)
      startMainProcessTracking(hooks, onRumEventObservable, onActivityObservable)

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
      setupIpcHandlers(onRumEventObservable)
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

function setupIpcHandlers(onRumEventObservable: Observable<CollectedRumEvent>) {
  ipcMain.handle('datadog:send', (_event, msg: string) => {
    const serverRumEvent = JSON.parse(msg) as BridgeEvent

    if (serverRumEvent.eventType !== 'rum') {
      console.log('not a rum event', serverRumEvent)

      return
    }

    onRumEventObservable.notify({ event: serverRumEvent.event, source: 'renderer' })
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

function startRumEventAssembleAndSend(
  configuration: RumConfiguration,
  onRumEventObservable: Observable<CollectedRumEvent>,
  rumBatch: Batch,
  hooks: Hooks
) {
  onRumEventObservable.subscribe(({ event, source }) => {
    const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
      eventType: event.type,
    })!

    if (defaultRumEventAttributes === DISCARDED || defaultRumEventAttributes.session?.id === undefined) {
      return
    }
    const commonContext =
      source === 'renderer'
        ? {
            session: { id: defaultRumEventAttributes.session.id },
            application: { id: configuration.applicationId },
          }
        : combine(defaultRumEventAttributes, {
            // TODO source electron
            source: 'browser' as const,
            application: { id: configuration.applicationId },
            session: {
              type: 'user' as const,
            },
            _dd: {
              format_version: 2 as const,
            },
          })

    const serverRumEvent = combine(event, commonContext)

    if (serverRumEvent.type === RumEventType.VIEW) {
      rumBatch.upsert(serverRumEvent as unknown as Context, serverRumEvent.view.id)
    } else {
      rumBatch.add(serverRumEvent as unknown as Context)
    }
  })
}

function startMainProcessTracking(
  hooks: Hooks,
  onRumEventObservable: Observable<CollectedRumEvent>,
  onActivityObservable: Observable<void>
) {
  const mainProcessContext = {
    sessionId: crypto.randomUUID(),
    viewId: crypto.randomUUID(),
  }
  hooks.register(HookNames.Assemble, ({ eventType }) => {
    return {
      type: eventType,
      session: {
        id: mainProcessContext.sessionId,
      },
      view: {
        id: mainProcessContext.viewId,
      },
    }
  })
  console.log('sessionId', mainProcessContext.sessionId)
  const applicationStart = timeStampNow()
  let applicationLaunch = {
    type: RumEventType.VIEW,
    date: applicationStart as number,
    view: {
      id: mainProcessContext.viewId,
      is_active: true,
      name: 'ApplicationLaunch',
      // TODO get customer package name
      url: 'com/datadog/application-launch/view',
      time_spent: 0,
      // TODO update counters
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
      document_version: 1,
    },
  } as RumViewEvent

  onRumEventObservable.notify({ event: applicationLaunch, source: 'main-process' })

  onActivityObservable.subscribe(() => {
    applicationLaunch = combine(applicationLaunch, {
      view: {
        time_spent: toServerDuration(elapsed(applicationStart, timeStampNow())),
      },
      _dd: {
        document_version: applicationLaunch._dd.document_version + 1,
      },
    })
    onRumEventObservable.notify({ event: applicationLaunch, source: 'main-process' })
  })
  // TODO session expiration / renewal
  // TODO useragent

  // TODO remove me when using dd-trace-js
  process.on('uncaughtException', (err) => {
    const error = computeRawError({
      originalError: err,
      startClocks: clocksNow(),
      nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
      source: 'source',
      handling: ErrorHandling.UNHANDLED,
    })
    const errorEvent: Partial<RumErrorEvent> = {
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
    onRumEventObservable.notify({ event: errorEvent as RumErrorEvent, source: 'main-process' })
  })
}

function startActivityTracking(onRumEventObservable: Observable<CollectedRumEvent>) {
  const onActivityObservable = new Observable<void>()
  const alreadySeenViewIds = new Set()
  onRumEventObservable.subscribe(({ event }) => {
    if (event.type === RumEventType.VIEW && !alreadySeenViewIds.has(event.view.id)) {
      alreadySeenViewIds.add(event.view.id)
      onActivityObservable.notify()
    } else if (event.type === RumEventType.ACTION && event.action.type === 'click') {
      onActivityObservable.notify()
    }
  })
  return onActivityObservable
}

export { tracer }
