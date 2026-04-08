import type { Module, InitConfiguration, Configuration } from '@datadog/core-next'
import {
  build,
  Pipeline,
  Batch,
  Session,
  registerSdk,
  sessionEnricher,
  internalContextEnricher,
  tagsEnricher,
} from '@datadog/core-next'
import { selectStore, createHttpRequest, createEndpointBuilder, INTAKE_SITE_US1 } from '@datadog/browser-core-next'
import type { TrackType, HttpRequest } from '@datadog/browser-core-next'

interface SdkOptions {
  modules?: Module[]
  instanceId?: string
}

type SdkInitConfiguration = InitConfiguration & SdkOptions & Record<string, unknown>

interface Sdk {
  [key: string]: unknown
}

async function createSdk(init: SdkInitConfiguration): Promise<Sdk | null> {
  // 1. Collect extensions from modules
  const modules = init.modules ?? []
  const extensions = modules.map((m) => m.extension)

  // 2. Build configuration
  const config = build(init, extensions)
  if (!config) {
    return null
  }

  // 3. Create session
  const store = selectStore()
  const session = await Session.create({
    store,
    generateId: () => crypto.randomUUID(),
    now: () => Date.now(),
  })

  // 4. Create pipeline
  const pipeline = new Pipeline<Record<string, unknown>>()

  // 4.5. Register core enrichers on all observation events
  pipeline.enrich('observation:*', sessionEnricher(session))
  pipeline.enrich('observation:*', internalContextEnricher())
  pipeline.enrich('observation:*', tagsEnricher({ env: config.env, service: config.service, version: config.version }))

  // 5. Create endpoint builders for each track type used by modules
  const trackTypes: TrackType[] = ['logs', 'rum', 'replay']
  const endpointBuilders = new Map<TrackType, ReturnType<typeof createEndpointBuilder>>()
  const transports = new Map<TrackType, HttpRequest>()

  for (const trackType of trackTypes) {
    const builder = createEndpointBuilder({
      clientToken: config.clientToken,
      site: config.site,
      trackType,
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
        source: config.source,
      })
      replicaTransports.set(trackType, createHttpRequest({ endpointUrl: () => replicaBuilder.build() }))
    }
  }

  const batch = new Batch({
    maxSizeBytes: 16 * 1024,
    maxCount: 50,
    flushTimeoutMs: 30_000,
  })

  // 6. Wire batch flush → transport (primary + replica)
  batch.on('flush', (messages) => {
    const data = messages.join('\n')
    const payload = { data, bytesCount: new Blob([data]).size }

    // Send to primary (logs endpoint for now, TODO: route by event type)
    const primary = transports.get('logs')
    primary?.send(payload)

    // Send to replica if configured
    const replica = replicaTransports?.get('logs')
    replica?.send({ ...payload })
  })

  // 7. Wire page exit → batch flush
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      batch.flush()
    }
  }
  const onBeforeUnload = () => {
    batch.flush()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload)
  }

  // 8. Wire session expire → batch flush
  session.on('expired', () => {
    batch.flush()
  })

  // 8.5. Wire all pipeline observations → batch
  pipeline.subscribe('observation:*', (event) => {
    batch.add(JSON.stringify(event))
  })

  // 9. Initialize modules
  const sdk: Sdk = {}
  const context = { config, pipeline, session }
  for (const mod of modules) {
    const api = mod.init(context)
    sdk[mod.name] = api
  }

  // 10. Seal pipeline
  pipeline.seal()

  // 11. Register in registry
  const instanceId = init.instanceId ?? 'default'
  registerSdk(instanceId, sdk)

  // Expose stop function for cleanup (used in tests and graceful shutdown)
  ;(sdk as any).__stop = () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
    batch.destroy()
  }

  return sdk
}

export { createSdk }
export type { Sdk, SdkOptions, SdkInitConfiguration }
