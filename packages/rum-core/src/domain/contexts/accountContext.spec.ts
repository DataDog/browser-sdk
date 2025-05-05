import type { ContextManager, RelativeTime } from '@datadog/browser-core'
import { display, removeStorageListeners } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames, createHooks } from '../../hooks'
import { startAccountContext } from './accountContext'

describe('account context', () => {
  let accountContext: ContextManager
  let displaySpy: jasmine.Spy
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()

    displaySpy = spyOn(display, 'warn')

    accountContext = startAccountContext(hooks, mockRumConfiguration())
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

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
        type: 'view',
        account: {
          id: '123',
          foo: 'bar',
        },
      })
    })

    it('should not set the account when account.id is undefined', () => {
      accountContext.setContext({ foo: 'bar' })
      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({} as PartialRumEvent)
    })
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
    accountContext = startAccountContext(hooks, mockRumConfiguration({ storeContextsAcrossPages: false }))
    accountContext.setContext({ id: '123' })

    expect(accountContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBeNull()
  })

  it('when enabled, should maintain the account in local storage', () => {
    accountContext = startAccountContext(hooks, mockRumConfiguration({ storeContextsAcrossPages: true }))

    accountContext.setContext({ id: 'foo', qux: 'qix' })
    expect(accountContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{"id":"foo","qux":"qix"}')
  })
})
