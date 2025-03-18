import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import {
  createCustomerDataTrackerManager,
  CustomerDataCompressionStatus,
  removeStorageListeners,
} from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import { createHooks } from '../../hooks'
import type { UserContext } from './userContext'
import { startUserContext } from './userContext'

describe('user context', () => {
  let userContext: UserContext
  let customerDataTrackerManager: CustomerDataTrackerManager

  beforeEach(() => {
    customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)
    userContext = startUserContext(customerDataTrackerManager, mockRumConfiguration({ trackAnonymousUser: false }))
  })

  it('should get user', () => {
    userContext.setUser({ id: '123' })
    expect(userContext.getUser()).toEqual({ id: '123' })
  })

  it('should set user property', () => {
    userContext.setUserProperty('foo', 'bar')
    expect(userContext.getUser()).toEqual({ foo: 'bar' })
  })

  it('should remove user property', () => {
    userContext.setUser({ id: '123', foo: 'bar' })
    userContext.removeUserProperty('foo')
    expect(userContext.getUser()).toEqual({ id: '123' })
  })

  it('should clear user', () => {
    userContext.setUser({ id: '123' })
    userContext.clearUser()
    expect(userContext.getUser()).toEqual({})
  })

  it('should sanitize predefined properties', () => {
    userContext.setUser({ id: null, name: 2, email: { bar: 'qux' } })

    expect(userContext.getUser()).toEqual({
      email: '[object Object]',
      id: 'null',
      name: '2',
    })
  })
})

describe('user context across pages', () => {
  let userContext: UserContext
  let customerDataTrackerManager: CustomerDataTrackerManager

  beforeEach(() => {
    customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    userContext = startUserContext(
      customerDataTrackerManager,
      mockRumConfiguration({ storeContextsAcrossPages: false })
    )
    userContext.setUser({ id: '123' })

    expect(userContext.getUser()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBeNull()
  })

  it('when enabled, should maintain the user in local storage', () => {
    userContext = startUserContext(customerDataTrackerManager, mockRumConfiguration({ storeContextsAcrossPages: true }))

    userContext.setUser({ id: 'foo', qux: 'qix' })
    expect(userContext.getUser()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"id":"foo","qux":"qix"}')

    userContext.setUserProperty('foo', 'bar')
    expect(userContext.getUser()).toEqual({ id: 'foo', qux: 'qix', foo: 'bar' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"id":"foo","qux":"qix","foo":"bar"}')

    userContext.removeUserProperty('foo')
    expect(userContext.getUser()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"id":"foo","qux":"qix"}')

    userContext.clearUser()
    expect(userContext.getUser()).toEqual({})
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{}')
  })
})
