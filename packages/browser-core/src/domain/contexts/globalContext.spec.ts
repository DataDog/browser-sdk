import { beforeEach, describe, expect, it } from 'vitest'
import type { RelativeTime } from '@datadog/js-core/time'
import { registerCleanupTask } from '../../../test'
import type { LogsConfiguration } from '../../../../browser-logs/src/domain/configuration'
import type { ContextManager } from '../context/contextManager'
import { removeStorageListeners } from '../context/storeContextManager'
import type { Configuration } from '../configuration'
import type { Hook } from '../../tools/abstractHooks'
import { createHook } from '../../tools/abstractHooks'
import { startGlobalContext } from './globalContext'

describe('logs global context', () => {
  let globalContext: ContextManager
  let hook: Hook<any, any>

  beforeEach(() => {
    hook = createHook()
  })

  describe('assemble hook', () => {
    it('should set the context in context in `context` namespace when specified', () => {
      const contextNamespace = true
      globalContext = startGlobalContext(hook, {} as LogsConfiguration, 'some_product_key', contextNamespace)

      globalContext.setContext({ id: '123', foo: 'bar' })
      const event = hook.trigger({ startTime: 0 as RelativeTime })

      expect(event).toEqual({
        context: {
          id: '123',
          foo: 'bar',
        },
      })
    })

    it('should set the context in root namespace when specified', () => {
      const contextNamespace = false
      globalContext = startGlobalContext(hook, {} as LogsConfiguration, 'some_product_key', contextNamespace)

      globalContext.setContext({ id: '123', foo: 'bar' })
      const event = hook.trigger({ startTime: 0 as RelativeTime })

      expect(event).toEqual({
        id: '123',
        foo: 'bar',
      })
    })
  })
})

describe('global context across pages', () => {
  let globalContext: ContextManager
  let hook: Hook<any, any>

  beforeEach(() => {
    hook = createHook()

    registerCleanupTask(() => {
      localStorage.clear()
      removeStorageListeners()
    })
  })

  it('when disabled, should store contexts only in memory', () => {
    globalContext = startGlobalContext(
      hook,
      { storeContextsAcrossPages: false } as Configuration,
      'some_product_key',
      false
    )
    globalContext.setContext({ id: '123' })

    expect(globalContext.getContext()).toEqual({ id: '123' })
    expect(localStorage.getItem('_dd_c_some_product_key_2')).toBeNull()
  })

  it('when enabled, should maintain the global context in local storage', () => {
    globalContext = startGlobalContext(
      hook,
      { storeContextsAcrossPages: true } as Configuration,
      'some_product_key',
      false
    )

    globalContext.setContext({ id: 'foo', qux: 'qix' })
    expect(globalContext.getContext()).toEqual({ id: 'foo', qux: 'qix' })
    expect(localStorage.getItem('_dd_c_some_product_key_2')).toBe('{"id":"foo","qux":"qix"}')
  })
})
