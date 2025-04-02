import type { ContextManager } from '@datadog/browser-core'
import { display, removeStorageListeners } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import { startAccountContext } from './accountContext'

describe('account context', () => {
  let accountContext: ContextManager
  let displaySpy: jasmine.Spy

  beforeEach(() => {
    displaySpy = spyOn(display, 'warn')

    accountContext = startAccountContext(mockRumConfiguration())
  })

  it('should get account', () => {
    accountContext.setContext({ id: '123' })
    expect(accountContext.getContext()).toEqual({ id: '123' })
  })

  it('should set account property', () => {
    accountContext.setContextProperty('foo', 'bar')
    expect(accountContext.getContext()).toEqual({ foo: 'bar' })
  })

  it('should remove account property', () => {
    accountContext.setContext({ id: '123', foo: 'bar' })
    accountContext.removeContextProperty('foo')
    expect(accountContext.getContext()).toEqual({ id: '123' })
  })

  it('should clear account', () => {
    accountContext.setContext({ id: '123' })
    accountContext.clearContext()
    expect(accountContext.getContext()).toEqual({})
  })

  it('should warn when the account.id is missing', () => {
    accountContext.setContext({ foo: 'bar' })
    expect(displaySpy).toHaveBeenCalled()
  })

  it('should sanitize predefined properties', () => {
    accountContext.setContext({ id: null, name: 2 })
    expect(accountContext.getContext()).toEqual({
      id: 'null',
      name: '2',
    })
  })
})

describe('account context across pages', () => {
  let accountContext: ContextManager

  beforeEach(() => {
    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    accountContext = startAccountContext(mockRumConfiguration({ storeContextsAcrossPages: false }))
    accountContext.setContext({ id: '123' })

    expect(accountContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBeNull()
  })

  it('when enabled, should maintain the account in local storage', () => {
    accountContext = startAccountContext(mockRumConfiguration({ storeContextsAcrossPages: true }))

    accountContext.setContext({ id: 'foo', qux: 'qix' })
    expect(accountContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{"id":"foo","qux":"qix"}')

    accountContext.setContextProperty('foo', 'bar')
    expect(accountContext.getContext()).toEqual({ id: 'foo', qux: 'qix', foo: 'bar' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{"id":"foo","qux":"qix","foo":"bar"}')

    accountContext.removeContextProperty('foo')
    expect(accountContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{"id":"foo","qux":"qix"}')

    accountContext.clearContext()
    expect(accountContext.getContext()).toEqual({})
    expect(localStorage.getItem('_dd_c_rum_4')).toBe('{}')
  })
})
