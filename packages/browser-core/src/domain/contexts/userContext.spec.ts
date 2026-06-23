import type { RelativeTime } from '@openobserve/js-core/time'
import { createHook, type Hook } from '@openobserve/js-core/assembly'
import { registerCleanupTask } from '../../../test'
import { mockRumConfiguration } from '../../../../browser-rum-core/test'
import type { ContextManager } from '../context/contextManager'
import { removeStorageListeners } from '../context/storeContextManager'
import type { Configuration } from '../configuration'
import type { SessionContext } from '../session/sessionManager'
import { startUserContext } from './userContext'

describe('user context', () => {
  let userContext: ContextManager
  let hook: Hook<any, any>
  const mockSessionManager = {
    findTrackedSession: () =>
      ({
        anonymousId: 'device-123',
      }) as SessionContext,
  }

  beforeEach(() => {
    hook = createHook()
    userContext = startUserContext(
      hook,
      mockRumConfiguration({ trackAnonymousUser: false }),
      mockSessionManager,
      'some_product_key'
    )
  })

  it('should sanitize predefined properties', () => {
    userContext.setContext({ id: false, name: 2, email: { bar: 'qux' } })

    expect(userContext.getContext()).toEqual({
      email: '[object Object]',
      id: 'false',
      name: '2',
    })
  })

  describe('assemble hook', () => {
    it('should set the user', () => {
      userContext.setContext({ id: '123', foo: 'bar' })
      const defaultRumEventAttributes = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        usr: {
          id: '123',
          foo: 'bar',
        },
      })
    })

    it('should set anonymous_id when trackAnonymousUser is true', () => {
      userContext = startUserContext(
        hook,
        { trackAnonymousUser: true } as Configuration,
        mockSessionManager,
        'some_product_key'
      )
      userContext.setContext({ id: '123' })
      const defaultRumEventAttributes = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        usr: {
          id: '123',
          anonymous_id: 'device-123',
        },
      })
    })

    it('should not override customer provided anonymous_id when trackAnonymousUser is true', () => {
      userContext = startUserContext(
        hook,
        { trackAnonymousUser: true } as Configuration,
        mockSessionManager,
        'some_product_key'
      )
      userContext.setContext({ id: '123', anonymous_id: 'foo' })
      const defaultRumEventAttributes = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({
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
  let userContext: ContextManager
  let hook: Hook<any, any>
  const mockSessionManager = { findTrackedSession: () => undefined }

  beforeEach(() => {
    hook = createHook()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    userContext = startUserContext(
      hook,
      { storeContextsAcrossPages: false } as Configuration,
      mockSessionManager,
      'some_product_key'
    )
    userContext.setContext({ id: '123' })

    expect(userContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_oo_c_some_product_key_1')).toBeNull()
  })

  it('when enabled, should maintain the user in local storage', () => {
    userContext = startUserContext(
      hook,
      { storeContextsAcrossPages: true } as Configuration,
      mockSessionManager,
      'some_product_key'
    )

    userContext.setContext({ id: 'foo', qux: 'qix' })
    expect(userContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_oo_c_some_product_key_1')).toBe('{"id":"foo","qux":"qix"}')
  })
})
