import type { Module, InitConfiguration, Configuration } from '@datadog/core-next'
import {
  build,
  Pipeline,
  Batch,
  Session,
  registerSdk,
  getSdk,
  unregisterSdk,
  sessionEnricher,
  internalContextEnricher,
  tagsEnricher,
  metadataEnricher,
  stackTraceEnricher,
} from '@datadog/core-next'
import {
  selectStore,
  createHttpRequest,
  createEndpointBuilder,
  INTAKE_SITE_US1,
  getCurrentSiteDomain,
} from '../browser'
import type { TrackType, HttpRequest } from '../browser'
import { startConsoleCollection as startConsoleCollectors } from '../collectors/consoleCollector'
import { startRuntimeErrorCollection } from '../collectors/runtimeErrorCollector'
import { startReportCollection } from '../collectors/reportCollector'
import { startFetchCollection } from '../collectors/fetchCollector'
import { startXhrCollection } from '../collectors/xhrCollector'
import { startCollectors as startPerformanceCollectors } from '@datadog/browser-performance-next/collectors'
import { startCollectors as startViewCollectors } from '@datadog/browser-views-next/collectors'

declare const __BUILD_ENV__SDK_VERSION__: string

interface SdkOptions {
  modules?: Module[]
  instanceId?: string
}

type SdkInitConfiguration = InitConfiguration & SdkOptions & Record<string, unknown>

interface Sdk {
  [key: string]: unknown
}

async function createSdk(init: SdkInitConfiguration): Promise<Sdk | null> {
  // 0. Guard against multiple init calls
  const instanceId = init.instanceId ?? 'default'
  if (getSdk(instanceId)) {
    if (!init.silentMultipleInit) {
      console.error('Datadog Browser SDK is already initialized.')
    }
    return null
  }

  // 1. Collect extensions from modules
  const modules = init.modules ?? []
  const extensions = modules.map((m) => m.extension)

  // 2. Build configuration — inject SDK version from build environment
  const config = build({ ...init, sdkVersion: init.sdkVersion ?? __BUILD_ENV__SDK_VERSION__ }, extensions)
  if (!config) {
    return null
  }

  // 3. Create session with cookie options and persistence from config
  const cookieOptions = {
    secure: config.useSecureSessionCookie,
    partitioned: config.usePartitionedCrossSiteSessionCookie,
    domain: config.trackSessionAcrossSubdomains ? getCurrentSiteDomain() : undefined,
  }
  const store = selectStore({ cookieOptions, sessionPersistence: config.sessionPersistence })
  const session = await Session.create({
    store,
    generateId: () => crypto.randomUUID(),
    now: () => Date.now(),
  })

  // 4. Create pipeline
  const pipeline = new Pipeline<Record<string, unknown>>()

  // 4.1. Start bundled collectors (always active, regardless of which modules are loaded)
  const stopConsoleCollectors = startConsoleCollectors(pipeline)
  const stopRuntimeErrorCollectors = startRuntimeErrorCollection(pipeline)
  const stopReportCollectors = startReportCollection(pipeline)
  const stopFetchCollectors = startFetchCollection(pipeline)
  const stopXhrCollectors = startXhrCollection(pipeline)
  const stopPerformanceCollectors = startPerformanceCollectors(pipeline)
  const stopViewCollectors = startViewCollectors(pipeline)

  // 4.5. Register stack trace enricher on resource events
  pipeline.enrich('resource:console', stackTraceEnricher())
  pipeline.enrich('resource:runtime_error', stackTraceEnricher())

  // 4.6. Register core enrichers on all observation events
  pipeline.enrich('observation:*', metadataEnricher({ service: config.service, source: config.source }))
  pipeline.enrich('observation:*', sessionEnricher(session))
  pipeline.enrich('observation:*', internalContextEnricher({ sdkVersion: config.sdkVersion }))
  pipeline.enrich(
    'observation:*',
    tagsEnricher({ env: config.env, service: config.service, version: config.version, sdkVersion: config.sdkVersion })
  )

  // 4.7. Add anonymous_id to usr context when trackAnonymousUser is enabled (default: true)
  if (config.trackAnonymousUser !== false) {
    pipeline.enrich('observation:*', {
      name: 'anonymousUser',
      transform(data) {
        const usr = (data.usr as Record<string, unknown>) ?? {}
        if (!usr.anonymous_id) {
          return { ...data, usr: { ...usr, anonymous_id: session.getDeviceId() } }
        }
        return data
      },
    })
  }

  // 5. Create endpoint builders for each track type used by modules
  const trackTypes: TrackType[] = ['logs', 'rum', 'replay']
  const endpointBuilders = new Map<TrackType, ReturnType<typeof createEndpointBuilder>>()
  const transports = new Map<TrackType, HttpRequest>()

  for (const trackType of trackTypes) {
    const builder = createEndpointBuilder({
      clientToken: config.clientToken,
      site: config.site,
      trackType,
      sdkVersion: config.sdkVersion,
      source: config.source,
      proxy: config.proxy,
      usePciIntake: config.usePciIntake,
    })
    endpointBuilders.set(trackType, builder)
    transports.set(trackType, createHttpRequest({ endpointUrl: () => builder.build() }))
  }

  // 5.5. Create replica transports for disaster recovery
  let replicaTransports: Map<TrackType, HttpRequest> | undefined
  if (config.replica) {
    replicaTransports = new Map()
    for (const trackType of ['logs', 'rum'] as TrackType[]) {
      const replicaBuilder = createEndpointBuilder({
        clientToken: config.replica.clientToken,
        site: INTAKE_SITE_US1,
        trackType,
        sdkVersion: config.sdkVersion,
        source: config.source,
      })
      replicaTransports.set(trackType, createHttpRequest({ endpointUrl: () => replicaBuilder.build() }))
    }
  }

  const logsBatch = new Batch({ maxSizeBytes: 16 * 1024, maxCount: 50, flushTimeoutMs: 30_000 })
  const rumBatch = new Batch({ maxSizeBytes: 16 * 1024, maxCount: 50, flushTimeoutMs: 30_000 })

  // 6. Wire batch flush → transport (primary + replica)
  logsBatch.on('flush', (messages) => {
    const data = messages.join('\n')
    const payload = { data, bytesCount: new Blob([data]).size }
    transports.get('logs')?.send(payload)
    replicaTransports?.get('logs')?.send({ ...payload })
  })

  rumBatch.on('flush', (messages) => {
    const data = messages.join('\n')
    const payload = { data, bytesCount: new Blob([data]).size }
    transports.get('rum')?.send(payload)
    replicaTransports?.get('rum')?.send({ ...payload })
  })

  // 7. Wire page exit → batch flush
  const flushAll = () => {
    logsBatch.flush()
    rumBatch.flush()
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushAll()
    }
  }
  const onBeforeUnload = () => {
    flushAll()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload)
  }

  // 8. Wire session expire → batch flush
  session.on('expired', () => {
    flushAll()
  })

  // 8.5. Wire pipeline observations → batches by type (with beforeSend gate)
  function applyBeforeSend(event: Record<string, unknown>): boolean {
    for (const mod of modules) {
      const moduleConfig = (config as Record<string, unknown>)[mod.name] as Record<string, unknown> | undefined
      const beforeSend = moduleConfig?.beforeSend as ((e: Record<string, unknown>) => boolean | void) | undefined
      if (beforeSend && beforeSend(event) === false) return false
    }
    return true
  }

  pipeline.subscribe('observation:log', (event) => {
    if (!applyBeforeSend(event as Record<string, unknown>)) return
    logsBatch.add(JSON.stringify(event))
  })

  pipeline.subscribe('observation:view', (event) => {
    if (!applyBeforeSend(event as Record<string, unknown>)) return
    rumBatch.add(JSON.stringify(event))
  })

  pipeline.subscribe('observation:rum_*', (event) => {
    if (!applyBeforeSend(event as Record<string, unknown>)) return
    rumBatch.add(JSON.stringify(event))
  })

  // 9. Initialize modules
  const sdk: Sdk = {}
  const context = { config, pipeline, session }
  for (const mod of modules) {
    const api = mod.init(context)
    sdk[mod.name] = api
  }

  // 10. Expose SDK utilities
  sdk.getInitConfiguration = () => ({ ...init })

  // 11. Seal pipeline
  pipeline.seal()

  // 12. Register in registry
  registerSdk(instanceId, sdk)

  // Expose stop function for cleanup (used in tests and graceful shutdown)
  ;(sdk as any).__stop = () => {
    stopConsoleCollectors()
    stopRuntimeErrorCollectors()
    stopReportCollectors()
    stopFetchCollectors()
    stopXhrCollectors()
    stopPerformanceCollectors()
    stopViewCollectors()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
    logsBatch.destroy()
    rumBatch.destroy()
    unregisterSdk(instanceId)
  }

  return sdk
}

export { createSdk }
export type { Sdk, SdkOptions, SdkInitConfiguration }
