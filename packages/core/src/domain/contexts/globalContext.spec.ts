import type { Hooks } from '../../../test'
import type { LogsConfiguration } from '../../../../logs/src/domain/configuration'
import type { ContextManager } from '../context/contextManager'
import { HookNames } from '../../tools/abstractHooks'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { createHooks, registerCleanupTask } from '../../../test'
import { removeStorageListeners } from '../context/storeContextManager'
import type { Configuration } from '../configuration'
import type { Observation } from '../../../../rum-core/src/domain/pipeline/rumPipelineEvents'
import { startGlobalContext, globalContextDecoratorFactory } from './globalContext'

describe('logs global context', () => {
  let globalContext: ContextManager
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
  })

  describe('assemble hook', () => {
    it('should set the context in context in `context` namespace when specified', () => {
      const contextNamespace = true
      globalContext = startGlobalContext(hooks, {} as LogsConfiguration, 'some_product_key', contextNamespace)

      globalContext.setContext({ id: '123', foo: 'bar' })
      const event = hooks.triggerHook(HookNames.Assemble, { startTime: 0 as RelativeTime })

      expect(event).toEqual({
        context: {
          id: '123',
          foo: 'bar',
        },
      })
    })

    it('should set the context in root namespace when specified', () => {
      const contextNamespace = false
      globalContext = startGlobalContext(hooks, {} as LogsConfiguration, 'some_product_key', contextNamespace)

      globalContext.setContext({ id: '123', foo: 'bar' })
      const event = hooks.triggerHook(HookNames.Assemble, { startTime: 0 as RelativeTime })

      expect(event).toEqual({
        id: '123',
        foo: 'bar',
      })
    })
  })
})

describe('globalContextDecoratorFactory', () => {
  it('should contribute context under context namespace when useContextNamespace is true', async () => {
    const factory = globalContextDecoratorFactory({
      getContext: () => ({ id: '123', foo: 'bar' }),
      useContextNamespace: true,
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect(result.attributes).toEqual({ context: { id: '123', foo: 'bar' } })
    }
  })

  it('should contribute context flat when useContextNamespace is false', async () => {
    const factory = globalContextDecoratorFactory({
      getContext: () => ({ id: '123', foo: 'bar' }),
      useContextNamespace: false,
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect(result.attributes).toEqual({ id: '123', foo: 'bar' })
    }
  })

  it('should skip when context is empty', async () => {
    const factory = globalContextDecoratorFactory({
      getContext: () => ({}),
      useContextNamespace: false,
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should declare canDiscard: false', () => {
    const factory = globalContextDecoratorFactory({ getContext: () => ({}), useContextNamespace: false })
    expect(factory.capabilities.canDiscard).toBe(false)
  })

  it('should declare name: "globalContext"', () => {
    const factory = globalContextDecoratorFactory({ getContext: () => ({}), useContextNamespace: false })
    expect(factory.name).toBe('globalContext')
  })
})

describe('global context across pages', () => {
  let globalContext: ContextManager
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    globalContext = startGlobalContext(
      hooks,
      { storeContextsAcrossPages: false } as Configuration,
      'some_product_key',
      false
    )
    globalContext.setContext({ id: '123' })

    expect(globalContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_some_product_key_2')).toBeNull()
  })

  it('when enabled, should maintain the global context in local storage', () => {
    globalContext = startGlobalContext(
      hooks,
      { storeContextsAcrossPages: true } as Configuration,
      'some_product_key',
      false
    )

    globalContext.setContext({ id: 'foo', qux: 'qix' })
    expect(globalContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_some_product_key_2')).toBe('{"id":"foo","qux":"qix"}')
  })
})
