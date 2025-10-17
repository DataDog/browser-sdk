import { vi } from 'vitest'
import type { RelativeTime } from '@datadog/browser-core'
import { createHooks } from '../../test'
import { DISCARDED, HookNames } from './abstractHooks'

describe('startHooks', () => {
  let hooks: ReturnType<typeof createHooks>
  const hookParams = { eventType: 'error', startTime: 1011 as RelativeTime } as any

  beforeEach(() => {
    hooks = createHooks()
  })

  it('unregister a hook callback', () => {
    const callback = vi.fn().mockReturnValue({ service: 'foo' })

    const { unregister } = hooks.register(HookNames.Assemble, callback)
    unregister()

    const result = hooks.triggerHook(HookNames.Assemble, hookParams)

    expect(callback).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  describe('assemble hook', () => {
    it('combines results from multiple callbacks', () => {
      const callback1 = vi.fn().mockReturnValue({ type: 'action', service: 'foo' })
      const callback2 = vi.fn().mockReturnValue({ type: 'action', version: 'bar' })

      hooks.register(HookNames.Assemble, callback1)
      hooks.register(HookNames.Assemble, callback2)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, hookParams)

      expect(defaultRumEventAttributes).toEqual({ type: 'action', service: 'foo', version: 'bar' })
      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('does not combine undefined results from callbacks', () => {
      const callback1 = vi.fn().mockReturnValue({ type: 'action', service: 'foo' })
      const callback2 = vi.fn().mockReturnValue(undefined)

      hooks.register(HookNames.Assemble, callback1)
      hooks.register(HookNames.Assemble, callback2)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, hookParams)

      expect(defaultRumEventAttributes).toEqual({ type: 'action', service: 'foo' })
      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('returns DISCARDED if one callbacks returns DISCARDED', () => {
      const callback1 = vi.fn().mockReturnValue({ type: 'action', service: 'foo' })
      const callback2 = vi.fn().mockReturnValue(DISCARDED)
      const callback3 = vi.fn().mockReturnValue({ type: 'action', version: 'bar' })

      hooks.register(HookNames.Assemble, callback1)
      hooks.register(HookNames.Assemble, callback2)
      hooks.register(HookNames.Assemble, callback3)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, hookParams)

      expect(defaultRumEventAttributes).toEqual(DISCARDED)
      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
      expect(callback3).not.toHaveBeenCalled()
    })

    it('returns undefined when no registered hooks', () => {
      const result = hooks.triggerHook(HookNames.Assemble, hookParams)
      expect(result).toBeUndefined()
    })
  })
})
