import type { CustomerDataTrackerManager, RelativeTime } from '@datadog/browser-core'
import {
  createCustomerDataTrackerManager,
  CustomerDataCompressionStatus,
  removeStorageListeners,
} from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createRumSessionManagerMock, mockRumConfiguration } from '../../../test'
import type { Hooks } from '../../hooks'
import { createHooks, HookNames } from '../../hooks'
import type { UserContext } from './userContext'
import { startUserContext } from './userContext'

describe('user context', () => {
  let hooks: Hooks
  let userContext: UserContext
  let customerDataTrackerManager: CustomerDataTrackerManager

  beforeEach(() => {
    customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)
    hooks = createHooks()

    userContext = startUserContext(
      customerDataTrackerManager,
      hooks,
      createRumSessionManagerMock(),
      mockRumConfiguration({ trackAnonymousUser: false })
    )
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

  describe('assemble hook', () => {
    it('should set the user', () => {
      userContext.setUser({ id: '123', foo: 'bar' })
      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
        type: 'view',
        usr: {
          id: '123',
          foo: 'bar',
        },
      })
    })

    it('should set the user.anonymous_id when trackAnonymousUser is true', () => {
      userContext = startUserContext(
        customerDataTrackerManager,
        hooks,
        createRumSessionManagerMock(),
        mockRumConfiguration({ trackAnonymousUser: true })
      )
      userContext.setUser({ id: '123' })
      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
        type: 'view',
        usr: {
          id: '123',
          anonymous_id: 'device-123',
        },
      })
    })

    it('should not override customer provided anonymous_id when trackAnonymousUser is true', () => {
      userContext = startUserContext(
        customerDataTrackerManager,
        hooks,
        createRumSessionManagerMock(),
        mockRumConfiguration({ trackAnonymousUser: true })
      )
      userContext.setUser({ id: '123', anonymous_id: 'foo' })
      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
        type: 'view',
        usr: {
          id: '123',
          anonymous_id: 'foo',
        },
      })
    })
  })
})

describe('user context across pages', () => {
  let hooks: Hooks
  let userContext: UserContext
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
    userContext = startUserContext(
      customerDataTrackerManager,
      hooks,
      createRumSessionManagerMock(),
      mockRumConfiguration({ storeContextsAcrossPages: false })
    )
    userContext.setUser({ id: '123' })

    expect(userContext.getUser()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_1')).toBeNull()
  })

  it('when enabled, should maintain the user in local storage', () => {
    userContext = startUserContext(
      customerDataTrackerManager,
      hooks,
      createRumSessionManagerMock(),
      mockRumConfiguration({ storeContextsAcrossPages: true })
    )

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
