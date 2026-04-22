import type { Module, InitConfiguration, Configuration } from '@datadog/core-next'
import {
  build,
  Pipeline,
  Session,
  ContextManager,
  registerSdk,
  getSdk,
  unregisterSdk,
  sessionEnricher,
  internalContextEnricher,
  tagsEnricher,
  metadataEnricher,
  stackTraceEnricher,
  contextEnricher,
  connectBridges,
} from '@datadog/core-next'
import { logsExtension } from '@datadog/browser-logs-next/extension'
import { rumExtension } from '@datadog/browser-rum-next/extension'
import { TransportRouter } from './transportRouter'
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

  // 1. Collect extensions — bundled extensions are always registered for config validation.
  // Module-specific config keys (e.g. `logs`, `rum`) are validated against their extensions
  // regardless of whether the module itself is loaded inline or dynamically.
  const bundledExtensions = [logsExtension, rumExtension]
  const modules = init.modules ?? []

  // 2. Build configuration — inject SDK version from build environment
  const config = build({ ...init, sdkVersion: init.sdkVersion ?? __BUILD_ENV__SDK_VERSION__ }, bundledExtensions)
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

  // 4. Create context managers (shared across all modules)
  const globalContext = new ContextManager()
  const userContext = new ContextManager()
  const accountContext = new ContextManager()

  // 4. Create pipeline
  const pipeline = new Pipeline<Record<string, unknown>>()

  // 4.0. Connect bridges — flush any events buffered before SDK init (pre-init buffering)
  connectBridges(pipeline)

  // 4.1. Start bundled collectors (always active, regardless of which modules are loaded)
  const stopConsoleCollectors = startConsoleCollectors(pipeline)
  const stopRuntimeErrorCollectors = startRuntimeErrorCollection(pipeline)
  const stopReportCollectors = startReportCollection(pipeline)
  const stopFetchCollectors = startFetchCollection(pipeline)
  const stopXhrCollectors = startXhrCollection(pipeline)

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
  pipeline.enrich('observation:*', contextEnricher(globalContext, userContext, accountContext))

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

  // 6. Build beforeSend gate from module configs
  function applyBeforeSend(event: Record<string, unknown>): boolean {
    for (const mod of modules) {
      const moduleConfig = (config as Record<string, unknown>)[mod.name] as Record<string, unknown> | undefined
      const beforeSend = moduleConfig?.beforeSend as ((e: Record<string, unknown>) => boolean | void) | undefined
      if (beforeSend && beforeSend(event) === false) return false
    }
    return true
  }

  // 6.5. Create router with primary transports — replica wiring happens via a wrapping transport
  const routerTransports = new Map<string, HttpRequest>()
  for (const [trackType, primaryTransport] of transports) {
    const replicaTransport = replicaTransports?.get(trackType as TrackType)
    if (replicaTransport) {
      // Wrap primary + replica into a single transport so the router only sees one
      routerTransports.set(trackType, {
        send(payload) {
          primaryTransport.send(payload)
          replicaTransport.send({ ...payload })
        },
        sendOnExit(payload) {
          primaryTransport.sendOnExit(payload)
          replicaTransport.sendOnExit({ ...payload })
        },
      })
    } else {
      routerTransports.set(trackType, primaryTransport)
    }
  }

  const router = new TransportRouter({
    pipeline,
    transports: routerTransports,
    batchOptions: { maxSizeBytes: 16 * 1024, maxCount: 50, flushTimeoutMs: 30_000 },
    beforeSend: applyBeforeSend,
  })

  // 7. Wire page exit → router flush
  const flushAll = () => router.flush()
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

  // 8. Wire session expire → router flush
  session.on('expired', () => {
    flushAll()
  })

  // 9. Initialize modules (modules register their routes via context.transport.route())
  const sdk: Sdk = {}
  const context = { config, pipeline, session, transport: { route: router.route.bind(router) } }
  for (const mod of modules) {
    const api = mod.init(context)
    sdk[mod.name] = api
  }

  // 10. Expose SDK utilities
  sdk.getInitConfiguration = () => ({ ...init })

  // 10.1. Expose context CRUD methods at SDK level
  sdk.setUser = (user: object) => userContext.set(user as Record<string, unknown>)
  sdk.getUser = () => userContext.get()
  sdk.setUserProperty = (key: string, value: unknown) => userContext.setProperty(key, value)
  sdk.removeUserProperty = (key: string) => userContext.removeProperty(key)
  sdk.clearUser = () => userContext.clear()
  sdk.setGlobalContext = (ctx: object) => globalContext.set(ctx as Record<string, unknown>)
  sdk.getGlobalContext = () => globalContext.get()
  sdk.setGlobalContextProperty = (key: string, value: unknown) => globalContext.setProperty(key, value)
  sdk.removeGlobalContextProperty = (key: string) => globalContext.removeProperty(key)
  sdk.clearGlobalContext = () => globalContext.clear()
  sdk.setAccount = (account: object) => accountContext.set(account as Record<string, unknown>)
  sdk.getAccount = () => accountContext.get()
  sdk.setAccountProperty = (key: string, value: unknown) => accountContext.setProperty(key, value)
  sdk.removeAccountProperty = (key: string) => accountContext.removeProperty(key)
  sdk.clearAccount = () => accountContext.clear()

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
    // Call __stop on each module API if it exposes one (e.g. for module-owned collectors)
    for (const mod of modules) {
      const api = sdk[mod.name] as Record<string, unknown> | undefined
      if (api && typeof (api as any).__stop === 'function') {
        ;(api as any).__stop()
      }
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
    router.destroy()
    unregisterSdk(instanceId)
  }

  return sdk
}

export { createSdk }
export type { Sdk, SdkOptions, SdkInitConfiguration }
