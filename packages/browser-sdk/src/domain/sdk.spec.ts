import type { Module } from '@datadog/core-next'
import { getSdk, unregisterSdk, Batch } from '@datadog/core-next'
import { createSdk } from './sdk'

// Stub session store that stores state in memory
function stubStore() {
  let state: any
  return {
    get: async () => state,
    set: async (s: any) => {
      state = s
    },
    clear: async () => {
      state = undefined
    },
    onExternalChange: () => () => {},
  }
}

// Stub module helper
function stubModule(name: string, api: Record<string, unknown> = {}): Module {
  return {
    name,
    extension: {
      key: name,
      validate: (init: unknown) => init ?? null,
    },
    init: jasmine.createSpy('init').and.returnValue(api),
  }
}

const validInit = {
  clientToken: 'test-token',
  site: 'datadoghq.com',
}

describe('createSdk', () => {
  afterEach(() => {
    unregisterSdk('default')
    unregisterSdk('custom')
  })

  it('should return an SDK object when config is valid', async () => {
    const sdk = await createSdk(validInit)

    expect(sdk).not.toBeNull()
    expect(sdk).toEqual(jasmine.any(Object))
  })

  it('should return null when config is invalid (missing clientToken)', async () => {
    const sdk = await createSdk({ site: 'datadoghq.com' } as any)

    expect(sdk).toBeNull()
  })

  it('should call module.init for each module', async () => {
    const mod1 = stubModule('rum')
    const mod2 = stubModule('logs')

    await createSdk({ ...validInit, modules: [mod1, mod2] })

    expect(mod1.init).toHaveBeenCalledTimes(1)
    expect(mod2.init).toHaveBeenCalledTimes(1)
  })

  it('should pass config, pipeline, session, and transport in the module context', async () => {
    const mod = stubModule('rum')

    await createSdk({ ...validInit, modules: [mod] })

    const context = (mod.init as jasmine.Spy).calls.mostRecent().args[0]
    expect(context.config).toBeDefined()
    expect(context.config.clientToken).toBe('test-token')
    expect(context.pipeline).toBeDefined()
    expect(context.session).toBeDefined()
    expect(context.transport).toBeDefined()
    expect(typeof context.transport.route).toBe('function')
  })

  it('should attach module API return value under sdk[module.name]', async () => {
    const api = { track: jasmine.createSpy('track') }
    const mod = stubModule('rum', api)

    const sdk = await createSdk({ ...validInit, modules: [mod] })

    expect(sdk!['rum']).toBe(api)
  })

  it('should register the SDK in the registry', async () => {
    const sdk = await createSdk(validInit)

    expect(getSdk('default')).toBe(sdk)
  })

  it('should register with custom instanceId', async () => {
    const sdk = await createSdk({ ...validInit, instanceId: 'custom' })

    expect(getSdk('custom')).toBe(sdk)
    expect(getSdk('default')).toBeUndefined()
  })

  it('should return null when a bundled extension validation fails (missing required field)', async () => {
    // Config validation now uses bundled extensions, not module extensions.
    // A known key with an invalid value causes bundled extension validation to fail.
    // forwardConsoleLogs with an invalid value causes logsExtension.validate to return null.
    const sdk = await createSdk({
      ...validInit,
      logs: { forwardConsoleLogs: ['invalid_api'] },
    } as any)

    expect(sdk).toBeNull()
  })

  it('module extension on Module is not used for config validation (bundled extensions are used instead)', async () => {
    const mod: Module = {
      name: 'rum',
      extension: {
        key: 'rum',
        validate: () => null, // Would reject if used
      },
      init: jasmine.createSpy('init').and.returnValue({}),
    }

    // Config validation uses bundled rumExtension, not the module's own extension.
    // rumExtension accepts any non-null rum config, so init should be called.
    const sdk = await createSdk({ ...validInit, rum: {}, modules: [mod] } as any)

    expect(sdk).not.toBeNull()
    expect(mod.init).toHaveBeenCalledTimes(1)
  })

  it('should call resolveModule for config keys not covered by inline modules', async () => {
    const dynamicMod = stubModule('logs')
    const resolveModuleSpy = jasmine.createSpy('resolveModule').and.returnValue(Promise.resolve(dynamicMod))

    await createSdk({ ...validInit, logs: {}, resolveModule: resolveModuleSpy } as any)

    expect(resolveModuleSpy).toHaveBeenCalledWith('logs')
    expect(dynamicMod.init).toHaveBeenCalledTimes(1)
  })

  it('should not call resolveModule for config keys already covered by inline modules', async () => {
    const inlineMod = stubModule('logs')
    const resolveModuleSpy = jasmine.createSpy('resolveModule').and.returnValue(Promise.resolve(stubModule('logs')))

    await createSdk({ ...validInit, logs: {}, modules: [inlineMod], resolveModule: resolveModuleSpy } as any)

    expect(resolveModuleSpy).not.toHaveBeenCalled()
    expect(inlineMod.init).toHaveBeenCalledTimes(1)
  })

  it('should continue initializing other modules when resolveModule rejects for one', async () => {
    const resolveModuleSpy = jasmine.createSpy('resolveModule').and.callFake((name: string) => {
      if (name === 'logs') return Promise.reject(new Error('logs failed'))
      return Promise.resolve(stubModule(name))
    })

    const consoleSpy = spyOn(console, 'warn')

    const sdk = await createSdk({
      ...validInit,
      logs: {},
      rum: {},
      resolveModule: resolveModuleSpy,
    } as any)

    expect(sdk).not.toBeNull()
    expect(consoleSpy).toHaveBeenCalled()
    // rum module should still be initialized
    expect(sdk!['rum']).toBeDefined()
    expect(sdk!['logs']).toBeUndefined()
  })

  it('should add observation:log events to the batch when route is registered', async () => {
    const batchAddSpy = spyOn(Batch.prototype, 'add')

    const observationModule: Module = {
      name: 'test',
      extension: { key: 'test', validate: (init: unknown) => init ?? null },
      init(context) {
        // Register the route so the router creates a batch for 'logs'
        context.transport.route('observation:log', 'logs')
        // Publish before seal — event is buffered and processed after seal()
        context.pipeline.publish('observation:log', { message: 'hello', status: 'info' })
        return {}
      },
    }

    await createSdk({ ...validInit, modules: [observationModule] })

    // Wait a tick for the pipeline's async processQueue to drain
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(batchAddSpy).toHaveBeenCalledWith(jasmine.stringContaining('hello'))
  })

  it('should serialize observation:log events as JSON when adding to the batch', async () => {
    const batchAddSpy = spyOn(Batch.prototype, 'add')

    const observationModule: Module = {
      name: 'test',
      extension: { key: 'test', validate: (init: unknown) => init ?? null },
      init(context) {
        // Register the route so the router creates a batch for 'logs'
        context.transport.route('observation:log', 'logs')
        context.pipeline.publish('observation:log', { message: 'serialized', status: 'warn', level: 3 })
        return {}
      },
    }

    await createSdk({ ...validInit, modules: [observationModule] })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(batchAddSpy).toHaveBeenCalledTimes(1)
    const serialized = batchAddSpy.calls.mostRecent().args[0]
    const parsed = JSON.parse(serialized)
    expect(parsed).toEqual(jasmine.objectContaining({ message: 'serialized', status: 'warn', level: 3 }))
  })
})
