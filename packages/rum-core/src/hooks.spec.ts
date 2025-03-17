import type { RelativeTime } from '@flashcatcloud/browser-core'
import { HookNames, createHooks } from './hooks'

describe('startHooks', () => {
  let hooks: ReturnType<typeof createHooks>
  const hookParams = { eventType: 'error', startTime: 1011 as RelativeTime } as any
  beforeEach(() => {
    hooks = createHooks()
  })

  it('unregister a hook callback', () => {
    const callback = jasmine.createSpy().and.returnValue({ service: 'foo' })

    const { unregister } = hooks.register(HookNames.Assemble, callback)
    unregister()

    const result = hooks.triggerHook(HookNames.Assemble, hookParams)

    expect(callback).not.toHaveBeenCalled()
    expect(result).toEqual(undefined)
  })

  describe('assemble hook', () => {
    it('combines results from multiple callbacks', () => {
      const callback1 = jasmine.createSpy().and.returnValue({ type: 'action', service: 'foo' })
      const callback2 = jasmine.createSpy().and.returnValue({ type: 'action', version: 'bar' })

      hooks.register(HookNames.Assemble, callback1)
      hooks.register(HookNames.Assemble, callback2)

      const result = hooks.triggerHook(HookNames.Assemble, hookParams)

      expect(result).toEqual({ type: 'action', service: 'foo', version: 'bar' })
      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('does not combine undefined results from callbacks', () => {
      const callback1 = jasmine.createSpy().and.returnValue({ type: 'action', service: 'foo' })
      const callback2 = jasmine.createSpy().and.returnValue(undefined)

      hooks.register(HookNames.Assemble, callback1)
      hooks.register(HookNames.Assemble, callback2)

      const result = hooks.triggerHook(HookNames.Assemble, hookParams)

      expect(result).toEqual({ type: 'action', service: 'foo' })
      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })
  })
})
