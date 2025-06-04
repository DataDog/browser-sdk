import type { ContextManager, RelativeTime } from '@datadog/browser-core'
import { HookNames, removeStorageListeners } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { LogsConfiguration } from '../configuration'
import { startGlobalContext } from './globalContext'

describe('logs global context', () => {
  let globalContext: ContextManager
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
    globalContext = startGlobalContext(hooks, {} as LogsConfiguration)
  })

  describe('assemble hook', () => {
    it('should set the context', () => {
      globalContext.setContext({ id: '123', foo: 'bar' })
      const event = hooks.triggerHook(HookNames.Assemble, { startTime: 0 as RelativeTime })

      expect(event).toEqual({
        id: '123',
        foo: 'bar',
      })
    })
  })
})

describe('logs global context across pages', () => {
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
    globalContext = startGlobalContext(hooks, { storeContextsAcrossPages: false } as LogsConfiguration)
    globalContext.setContext({ id: '123' })

    expect(globalContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_logs_2')).toBeNull()
  })

  it('when enabled, should maintain the global context in local storage', () => {
    globalContext = startGlobalContext(hooks, { storeContextsAcrossPages: true } as LogsConfiguration)

    globalContext.setContext({ id: 'foo', qux: 'qix' })
    expect(globalContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_logs_2')).toBe('{"id":"foo","qux":"qix"}')
  })
})
