import type { Hooks } from '../../../test'
import { createHooks, registerCleanupTask } from '../../../test'
import { mockRumConfiguration } from '../../../../rum-core/test'
import type { ContextManager } from '../context/contextManager'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { HookNames } from '../../tools/abstractHooks'
import { removeStorageListeners } from '../context/storeContextManager'
import type { Configuration } from '../configuration'
import type { SessionContext } from '../session/sessionManager'
import { startUserContext } from './userContext'

describe('user context', () => {
  let userContext: ContextManager
  let hooks: Hooks
  const mockSessionManager = {
    findTrackedSession: () =>
      ({
        anonymousId: 'device-123',
      }) as SessionContext<string>,
  }

  beforeEach(() => {
    hooks = createHooks()
    userContext = startUserContext(
      hooks,
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
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
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
        hooks,
        { trackAnonymousUser: true } as Configuration,
        mockSessionManager,
        'some_product_key'
      )
      userContext.setContext({ id: '123' })
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
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
        hooks,
        { trackAnonymousUser: true } as Configuration,
        mockSessionManager,
        'some_product_key'
      )
      userContext.setContext({ id: '123', anonymous_id: 'foo' })
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
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
  let hooks: Hooks
  const mockSessionManager = { findTrackedSession: () => undefined }

  beforeEach(() => {
    hooks = createHooks()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    userContext = startUserContext(
      hooks,
      { storeContextsAcrossPages: false } as Configuration,
      mockSessionManager,
      'some_product_key'
    )
    userContext.setContext({ id: '123' })

    expect(userContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_some_product_key_1')).toBeNull()
  })

  it('when enabled, should maintain the user in local storage', () => {
    userContext = startUserContext(
      hooks,
      { storeContextsAcrossPages: true } as Configuration,
      mockSessionManager,
      'some_product_key'
    )

    userContext.setContext({ id: 'foo', qux: 'qix' })
    expect(userContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_some_product_key_1')).toBe('{"id":"foo","qux":"qix"}')
  })
})
