import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import {
  createCustomerDataTrackerManager,
  CustomerDataCompressionStatus,
  removeStorageListeners,
} from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import type { GlobalContext } from './globalContext'
import { startGlobalContext } from './globalContext'

describe('global context', () => {
  let globalContext: GlobalContext

  beforeEach(() => {
    const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)
    globalContext = startGlobalContext(customerDataTrackerManager, mockRumConfiguration())
  })

  it('should get context', () => {
    globalContext.setGlobalContext({ id: '123' })
    expect(globalContext.getGlobalContext()).toEqual({ id: '123' })
  })

  it('should set context property', () => {
    globalContext.setGlobalContextProperty('foo', 'bar')
    expect(globalContext.getGlobalContext()).toEqual({ foo: 'bar' })
  })

  it('should remove context property', () => {
    globalContext.setGlobalContext({ id: '123', foo: 'bar' })
    globalContext.removeGlobalContextProperty('foo')
    expect(globalContext.getGlobalContext()).toEqual({ id: '123' })
  })

  it('should clear context', () => {
    globalContext.setGlobalContext({ id: '123' })
    globalContext.clearGlobalContext()
    expect(globalContext.getGlobalContext()).toEqual({})
  })
})

describe('global context across pages', () => {
  let globalContext: GlobalContext
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
    globalContext.setGlobalContext({ id: '123' })

    expect(globalContext.getGlobalContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBeNull()
  })

  it('when enabled, should maintain the global context in local storage', () => {
    globalContext = startGlobalContext(
      customerDataTrackerManager,
      mockRumConfiguration({ storeContextsAcrossPages: true })
    )

    globalContext.setGlobalContext({ id: 'foo', qux: 'qix' })
    expect(globalContext.getGlobalContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"id":"foo","qux":"qix"}')

    globalContext.setGlobalContextProperty('foo', 'bar')
    expect(globalContext.getGlobalContext()).toEqual({ id: 'foo', qux: 'qix', foo: 'bar' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"id":"foo","qux":"qix","foo":"bar"}')

    globalContext.removeGlobalContextProperty('foo')
    expect(globalContext.getGlobalContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"id":"foo","qux":"qix"}')

    globalContext.clearGlobalContext()
    expect(globalContext.getGlobalContext()).toEqual({})
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{}')
  })
})
