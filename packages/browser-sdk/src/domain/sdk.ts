import type { Module, InitConfiguration, Configuration } from '@datadog/core-next'
import { build, Pipeline, Batch, Session, registerSdk } from '@datadog/core-next'
import { selectStore, createHttpRequest } from '@datadog/browser-core-next'

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

  // 5. Create transport + batch
  const endpointUrl = `https://${config.site}/api/v2/rum`
  const transport = createHttpRequest({ endpointUrl })
  const batch = new Batch({
    maxSizeBytes: 16 * 1024,
    maxCount: 50,
    flushTimeoutMs: 30_000,
  })

  // 6. Wire batch flush → transport
  batch.on('flush', (messages) => {
    const data = messages.join('\n')
    transport.send({ data, bytesCount: new Blob([data]).size })
  })

  // 7. Wire page exit → batch flush
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        batch.flush()
      }
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      batch.flush()
    })
  }

  // 8. Wire session expire → batch flush
  session.on('expired', () => {
    batch.flush()
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

  return sdk
}

export { createSdk }
export type { Sdk, SdkOptions, SdkInitConfiguration }
