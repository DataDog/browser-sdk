import type { Hooks } from '../../../test'
import { createHooks, registerCleanupTask } from '../../../test'
import { mockRumConfiguration } from '../../../../rum-core/test'
import type { ContextManager } from '../context/contextManager'
import { display } from '../../tools/display'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { HookNames } from '../../tools/abstractHooks'
import { removeStorageListeners } from '../context/storeContextManager'
import type { Observation } from '../../../../rum-core/src/domain/pipeline/rumPipelineEvents'
import { startAccountContext, accountContextDecoratorFactory } from './accountContext'

describe('account context', () => {
  let accountContext: ContextManager
  let displaySpy: jasmine.Spy
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
    displaySpy = spyOn(display, 'warn')

    accountContext = startAccountContext(hooks, mockRumConfiguration(), 'some_product_key')
  })

  it('should warn when the account.id is missing', () => {
    accountContext.setContext({ foo: 'bar' })
    expect(displaySpy).toHaveBeenCalled()
  })

  it('should sanitize predefined properties', () => {
    accountContext.setContext({ id: false, name: 2 })
    expect(accountContext.getContext()).toEqual({
      id: 'false',
      name: '2',
    })
  })

  describe('assemble hook', () => {
    it('should set the account', () => {
      accountContext.setContext({ id: '123', foo: 'bar' })

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({
        account: {
          id: '123',
          foo: 'bar',
        },
      })
    })

    it('should not set the account when account.id is undefined', () => {
      accountContext.setContext({ foo: 'bar' })
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toBeUndefined()
    })
  })
})

describe('accountContextDecoratorFactory', () => {
  it('should contribute account when account has id', async () => {
    const factory = accountContextDecoratorFactory({
      getAccount: () => ({ id: '123', name: 'Acme' }),
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect(result.attributes).toEqual({ account: { id: '123', name: 'Acme' } })
    }
  })

  it('should skip when account is empty', async () => {
    const factory = accountContextDecoratorFactory({
      getAccount: () => ({} as any),
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should skip when account has no id', async () => {
    const factory = accountContextDecoratorFactory({
      getAccount: () => ({ name: 'Acme' } as any),
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should declare canDiscard: false', () => {
    const factory = accountContextDecoratorFactory({ getAccount: () => ({} as any) })
    expect(factory.capabilities.canDiscard).toBe(false)
  })

  it('should declare name: "accountContext"', () => {
    const factory = accountContextDecoratorFactory({ getAccount: () => ({} as any) })
    expect(factory.name).toBe('accountContext')
  })
})

describe('account context across pages', () => {
  let accountContext: ContextManager
  let hooks: Hooks
  beforeEach(() => {
    hooks = createHooks()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    accountContext = startAccountContext(
      hooks,
      mockRumConfiguration({ storeContextsAcrossPages: false }),
      'some_product_key'
    )
    accountContext.setContext({ id: '123' })

    expect(accountContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBeNull()
  })

  it('when enabled, should maintain the account in local storage', () => {
    accountContext = startAccountContext(
      hooks,
      mockRumConfiguration({ storeContextsAcrossPages: true }),
      'some_product_key'
    )

    accountContext.setContext({ id: 'foo', qux: 'qix' })
    expect(accountContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_some_product_key_4')).toBe('{"id":"foo","qux":"qix"}')
  })
})
