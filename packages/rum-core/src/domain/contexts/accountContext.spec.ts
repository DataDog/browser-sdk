import type { CustomerDataTrackerManager, RelativeTime } from '@datadog/browser-core'
import {
  createCustomerDataTrackerManager,
  CustomerDataCompressionStatus,
  display,
  removeStorageListeners,
} from '@datadog/browser-core'
import { registerCleanupTask } from 'packages/core/test'
import { mockRumConfiguration } from '../../../test'
import type { Hooks } from '../../hooks'
import { createHooks, HookNames } from '../../hooks'
import type { AccountContext } from './accountContext'
import { startAccountContext } from './accountContext'

describe('account context', () => {
  let hooks: Hooks
  let accountContext: AccountContext
  let displaySpy: jasmine.Spy

  beforeEach(() => {
    const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)
    hooks = createHooks()
    displaySpy = spyOn(display, 'warn')

    accountContext = startAccountContext(customerDataTrackerManager, hooks, mockRumConfiguration())
  })

  it('should get account', () => {
    accountContext.setAccount({ id: '123' })
    expect(accountContext.getAccount()).toEqual({ id: '123' })
  })

  it('should set account property', () => {
    accountContext.setAccountProperty('foo', 'bar')
    expect(accountContext.getAccount()).toEqual({ foo: 'bar' })
  })

  it('should remove account property', () => {
    accountContext.setAccount({ id: '123', foo: 'bar' })
    accountContext.removeAccountProperty('foo')
    expect(accountContext.getAccount()).toEqual({ id: '123' })
  })

  it('should clear account', () => {
    accountContext.setAccount({ id: '123' })
    accountContext.clearAccount()
    expect(accountContext.getAccount()).toEqual({})
  })

  it('should warn when the account.id is missing', () => {
    accountContext.setAccount({ foo: 'bar' })
    expect(displaySpy).toHaveBeenCalled()
  })

  it('should sanitize predefined properties', () => {
    accountContext.setAccount({ id: null, name: 2 })
    expect(accountContext.getAccount()).toEqual({
      id: 'null',
      name: '2',
    })
  })

  describe('assemble hook', () => {
    it('should set the account', () => {
      accountContext.setAccount({ id: '123', foo: 'bar' })

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
      accountContext.setAccount({ foo: 'bar' })
      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual(undefined)
    })
  })
})

describe('account context across pages', () => {
  let hooks: Hooks
  let accountContext: AccountContext
  let customerDataTrackerManager: CustomerDataTrackerManager

  beforeEach(() => {
    customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)
    hooks = createHooks()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    accountContext = startAccountContext(
      customerDataTrackerManager,
      hooks,
      mockRumConfiguration({ storeContextsAcrossPages: false })
    )
    accountContext.setAccount({ id: '123' })

    expect(accountContext.getAccount()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBeNull()
  })

  it('when enabled, should maintain the account in local storage', () => {
    accountContext = startAccountContext(
      customerDataTrackerManager,
      hooks,
      mockRumConfiguration({ storeContextsAcrossPages: true })
    )

    accountContext.setAccount({ id: 'foo', qux: 'qix' })
    expect(accountContext.getAccount()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{"id":"foo","qux":"qix"}')

    accountContext.setAccountProperty('foo', 'bar')
    expect(accountContext.getAccount()).toEqual({ id: 'foo', qux: 'qix', foo: 'bar' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{"id":"foo","qux":"qix","foo":"bar"}')

    accountContext.removeAccountProperty('foo')
    expect(accountContext.getAccount()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{"id":"foo","qux":"qix"}')

    accountContext.clearAccount()
    expect(accountContext.getAccount()).toEqual({})
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{}')
  })
})
