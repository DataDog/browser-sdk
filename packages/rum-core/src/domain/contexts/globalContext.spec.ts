import type { ContextManager, CustomerDataTrackerManager } from '@datadog/browser-core'
import {
  createCustomerDataTrackerManager,
  CustomerDataCompressionStatus,
  removeStorageListeners,
} from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import { startGlobalContext } from './globalContext'

describe('global context', () => {
  let globalContext: ContextManager

  beforeEach(() => {
    const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)
    globalContext = startGlobalContext(customerDataTrackerManager, mockRumConfiguration())
  })

  it('should get context', () => {
    globalContext.setContext({ id: '123' })
    expect(globalContext.getContext()).toEqual({ id: '123' })
  })

  it('should set context property', () => {
    globalContext.setContextProperty('foo', 'bar')
    expect(globalContext.getContext()).toEqual({ foo: 'bar' })
  })

  it('should remove context property', () => {
    globalContext.setContext({ id: '123', foo: 'bar' })
    globalContext.removeContextProperty('foo')
    expect(globalContext.getContext()).toEqual({ id: '123' })
  })

  it('should clear context', () => {
    globalContext.setContext({ id: '123' })
    globalContext.clearContext()
    expect(globalContext.getContext()).toEqual({})
  })
})

describe('global context across pages', () => {
  let globalContext: ContextManager
  let customerDataTrackerManager: CustomerDataTrackerManager

  beforeEach(() => {
    customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    globalContext = startGlobalContext(
      customerDataTrackerManager,
      mockRumConfiguration({ storeContextsAcrossPages: false })
    )
    globalContext.setContext({ id: '123' })

    expect(globalContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBeNull()
  })

  it('when enabled, should maintain the global context in local storage', () => {
    globalContext = startGlobalContext(
      customerDataTrackerManager,
      mockRumConfiguration({ storeContextsAcrossPages: true })
    )

    globalContext.setContext({ id: 'foo', qux: 'qix' })
    expect(globalContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"id":"foo","qux":"qix"}')

    globalContext.setContextProperty('foo', 'bar')
    expect(globalContext.getContext()).toEqual({ id: 'foo', qux: 'qix', foo: 'bar' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"id":"foo","qux":"qix","foo":"bar"}')

    globalContext.removeContextProperty('foo')
    expect(globalContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"id":"foo","qux":"qix"}')

    globalContext.clearContext()
    expect(globalContext.getContext()).toEqual({})
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{}')
  })
})
