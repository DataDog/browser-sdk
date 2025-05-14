import type { ContextManager, RelativeTime } from '@datadog/browser-core'
import { HookNames, removeStorageListeners } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startGlobalContext } from './globalContext'

describe('global context', () => {
  let globalContext: ContextManager
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
    globalContext = startGlobalContext(hooks, mockRumConfiguration())
  })

  describe('assemble hook', () => {
    it('should set the context', () => {
      globalContext.setContext({ id: '123', foo: 'bar' })
      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
        type: 'view',
        context: {
          id: '123',
          foo: 'bar',
        },
      })
    })
  })
})

describe('global context across pages', () => {
  let globalContext: ContextManager
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    globalContext = startGlobalContext(hooks, mockRumConfiguration({ storeContextsAcrossPages: false }))
    globalContext.setContext({ id: '123' })

    expect(globalContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBeNull()
  })

  it('when enabled, should maintain the global context in local storage', () => {
    globalContext = startGlobalContext(hooks, mockRumConfiguration({ storeContextsAcrossPages: true }))

    globalContext.setContext({ id: 'foo', qux: 'qix' })
    expect(globalContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"id":"foo","qux":"qix"}')
  })
})
