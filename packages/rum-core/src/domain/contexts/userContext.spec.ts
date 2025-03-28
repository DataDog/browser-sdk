import type { ContextManager, CustomerDataTrackerManager } from '@datadog/browser-core'
import {
  createCustomerDataTrackerManager,
  CustomerDataCompressionStatus,
  removeStorageListeners,
} from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import { startUserContext } from './userContext'

describe('user context', () => {
  let userContext: ContextManager
  let customerDataTrackerManager: CustomerDataTrackerManager

  beforeEach(() => {
    customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)
    userContext = startUserContext(customerDataTrackerManager, mockRumConfiguration({ trackAnonymousUser: false }))
  })

  it('should get user', () => {
    userContext.setContext({ id: '123' })
    expect(userContext.getContext()).toEqual({ id: '123' })
  })

  it('should set user property', () => {
    userContext.setContextProperty('foo', 'bar')
    expect(userContext.getContext()).toEqual({ foo: 'bar' })
  })

  it('should remove user property', () => {
    userContext.setContext({ id: '123', foo: 'bar' })
    userContext.removeContextProperty('foo')
    expect(userContext.getContext()).toEqual({ id: '123' })
  })

  it('should clear user', () => {
    userContext.setContext({ id: '123' })
    userContext.clearContext()
    expect(userContext.getContext()).toEqual({})
  })

  it('should sanitize predefined properties', () => {
    userContext.setContext({ id: null, name: 2, email: { bar: 'qux' } })

    expect(userContext.getContext()).toEqual({
      email: '[object Object]',
      id: 'null',
      name: '2',
    })
  })
})

describe('user context across pages', () => {
  let userContext: ContextManager
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
    userContext.setContext({ id: '123' })

    expect(userContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBeNull()
  })

  it('when enabled, should maintain the user in local storage', () => {
    userContext = startUserContext(customerDataTrackerManager, mockRumConfiguration({ storeContextsAcrossPages: true }))

    userContext.setContext({ id: 'foo', qux: 'qix' })
    expect(userContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"id":"foo","qux":"qix"}')

    userContext.setContextProperty('foo', 'bar')
    expect(userContext.getContext()).toEqual({ id: 'foo', qux: 'qix', foo: 'bar' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"id":"foo","qux":"qix","foo":"bar"}')

    userContext.removeContextProperty('foo')
    expect(userContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"id":"foo","qux":"qix"}')

    userContext.clearContext()
    expect(userContext.getContext()).toEqual({})
    expect(localStorage.getItem('_dd_c_rum_1')).toBe('{}')
  })
})
