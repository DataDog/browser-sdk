import type { RelativeTime } from '@datadog/js-core/time'
import { registerCleanupTask } from '../../../test'
import { mockRumConfiguration } from '../../../../browser-rum-core/test'
import type { ContextManager } from '../context/contextManager'
import { display } from '../../tools/display'
import { removeStorageListeners } from '../context/storeContextManager'
import type { Hook } from '../../tools/abstractHooks'
import { createHook } from '../../tools/abstractHooks'
import { startAccountContext } from './accountContext'

describe('account context', () => {
  let accountContext: ContextManager
  let displaySpy: jasmine.Spy
  let hook: Hook<any, any>

  beforeEach(() => {
    hook = createHook()
    displaySpy = spyOn(display, 'warn')

    accountContext = startAccountContext(hook, mockRumConfiguration(), 'some_product_key')
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

      const defaultRumEventAttributes = hook.trigger({
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
      const defaultRumEventAttributes = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toBeUndefined()
    })
  })
})

describe('account context across pages', () => {
  let accountContext: ContextManager
  let hook: Hook<any, any>

  beforeEach(() => {
    hook = createHook()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    accountContext = startAccountContext(
      hook,
      mockRumConfiguration({ storeContextsAcrossPages: false }),
      'some_product_key'
    )
    accountContext.setContext({ id: '123' })

    expect(accountContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBeNull()
  })

  it('when enabled, should maintain the account in local storage', () => {
    accountContext = startAccountContext(
      hook,
      mockRumConfiguration({ storeContextsAcrossPages: true }),
      'some_product_key'
    )

    accountContext.setContext({ id: 'foo', qux: 'qix' })
    expect(accountContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_some_product_key_4')).toBe('{"id":"foo","qux":"qix"}')
  })
})
