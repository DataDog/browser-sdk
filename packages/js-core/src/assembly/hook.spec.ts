import type { RelativeTime } from '../entries/time'
import { DISCARDED, SKIPPED, createHook } from './hook'

describe('createHook', () => {
  const hookParams = { eventType: 'error', startTime: 1011 as RelativeTime }

  it('unregisters a callback', () => {
    const hook = createHook<typeof hookParams, object>()
    const callback = jasmine.createSpy().and.returnValue({ service: 'foo' })

    const { unregister } = hook.register(callback)
    unregister()

    const result = hook.trigger(hookParams)

    expect(callback).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('combines results from multiple callbacks', () => {
    const hook = createHook<typeof hookParams, object>()
    const callback1 = jasmine.createSpy().and.returnValue({ type: 'action', service: 'foo' })
    const callback2 = jasmine.createSpy().and.returnValue({ type: 'action', version: 'bar' })

    hook.register(callback1)
    hook.register(callback2)

    const result = hook.trigger(hookParams)

    expect(result).toEqual({ type: 'action', service: 'foo', version: 'bar' })
    expect(callback1).toHaveBeenCalled()
    expect(callback2).toHaveBeenCalled()
  })

  it('does not combine undefined results from callbacks', () => {
    const hook = createHook<typeof hookParams, object>()
    const callback1 = jasmine.createSpy().and.returnValue({ type: 'action', service: 'foo' })
    const callback2 = jasmine.createSpy().and.returnValue(undefined)

    hook.register(callback1)
    hook.register(callback2)

    const result = hook.trigger(hookParams)

    expect(result).toEqual({ type: 'action', service: 'foo' })
  })

  it('returns DISCARDED if one callback returns DISCARDED', () => {
    const hook = createHook<typeof hookParams, object>()
    const callback1 = jasmine.createSpy().and.returnValue({ type: 'action', service: 'foo' })
    const callback2 = jasmine.createSpy().and.returnValue(DISCARDED)
    const callback3 = jasmine.createSpy().and.returnValue({ type: 'action', version: 'bar' })

    hook.register(callback1)
    hook.register(callback2)
    hook.register(callback3)

    const result = hook.trigger(hookParams)

    expect(result).toEqual(DISCARDED)
    expect(callback1).toHaveBeenCalled()
    expect(callback2).toHaveBeenCalled()
    expect(callback3).not.toHaveBeenCalled()
  })

  it('skips callbacks that return SKIPPED', () => {
    const hook = createHook<typeof hookParams, object>()
    const callback1 = jasmine.createSpy().and.returnValue(SKIPPED)
    const callback2 = jasmine.createSpy().and.returnValue({ type: 'action', service: 'foo' })

    hook.register(callback1)
    hook.register(callback2)

    const result = hook.trigger(hookParams)

    expect(result).toEqual({ type: 'action', service: 'foo' })
  })

  it('returns undefined when no callbacks are registered', () => {
    const hook = createHook<typeof hookParams, object>()
    const result = hook.trigger(hookParams)
    expect(result).toBeUndefined()
  })
})
