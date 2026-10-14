import { globalObject } from '@datadog/js-core/util'
import { mockClock, registerCleanupTask, replaceMockable, type Clock } from '../../test'
import { MAX_TASK_TIME, requestIdleCallbackShim, requestIdleCallback } from './requestIdleCallback'

describe('requestIdleCallback', () => {
  it('uses a cancellable timer without a window', () => {
    replaceMockable(globalObject.window, undefined)
    const clock = mockClock()
    const callback = jasmine.createSpy()
    requestIdleCallback(callback)
    requestIdleCallback(callback)()

    expect(callback).not.toHaveBeenCalled()
    clock.tick(0)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('fallbacks to the shim when requestIdleCallback is not available', () => {
    const clock = mockClock()
    removeGlobalRequestIdleCallback()

    const spy = jasmine.createSpy<(deadline: IdleDeadline) => void>()

    requestIdleCallback(spy)
    expect(spy).not.toHaveBeenCalled()

    clock.tick(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('requestIdleCallbackShim', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  it('calls the callback asynchronously', () => {
    const spy = jasmine.createSpy<(deadline: IdleDeadline) => void>()
    requestIdleCallbackShim(spy)
    expect(spy).not.toHaveBeenCalled()
    clock.tick(0)
    expect(spy).toHaveBeenCalledOnceWith({ didTimeout: false, timeRemaining: jasmine.any(Function) })
  })

  it('notifies the remaining time', () => {
    const spy = jasmine.createSpy<(deadline: IdleDeadline) => void>()
    requestIdleCallbackShim(spy)

    clock.tick(10)
    const deadline = spy.calls.mostRecent().args[0]

    expect(deadline.timeRemaining()).toBe(MAX_TASK_TIME - 10)

    clock.tick(10)
    expect(deadline.timeRemaining()).toBe(MAX_TASK_TIME - 20)

    clock.tick(MAX_TASK_TIME + 100)
    expect(deadline.timeRemaining()).toBe(0)
  })

  it('cancels the callback when calling the stop function', () => {
    const spy = jasmine.createSpy<(deadline: IdleDeadline) => void>()
    const stop = requestIdleCallbackShim(spy)
    stop()
    clock.tick(0)
    expect(spy).not.toHaveBeenCalled()
  })
})

function removeGlobalRequestIdleCallback() {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = window.requestIdleCallback
  ;(window as any).requestIdleCallback = undefined
  registerCleanupTask(() => {
    window.requestIdleCallback = original
  })
}
