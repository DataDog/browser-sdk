import { registerCleanupTask } from '../registerCleanupTask'

export function mockRequestIdleCallback() {
  const callbacks = new Map<number, () => void>()
  let requestIdleCallbackSpy: jasmine.Spy | undefined
  let cancelIdleCallbackSpy: jasmine.Spy | undefined

  if (!window.requestIdleCallback || !window.cancelIdleCallback) {
    console.log('Animation Frame')
    const requestAnimationFrameSpy = spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      const id = Math.random()
      callbacks.set(id, callback as () => void)
      return id
    })

    const cancelAnimationFrameSpy = spyOn(window, 'cancelAnimationFrame').and.callFake((id) => {
      callbacks.delete(id)
    })

    registerCleanupTask(() => {
      requestAnimationFrameSpy.calls.reset()
      cancelAnimationFrameSpy.calls.reset()
      callbacks.clear()
    })
  } else {
    console.log('Request Idle Callback')
    requestIdleCallbackSpy = spyOn(window, 'requestIdleCallback').and.callFake((callback) => {
      const id = Math.random()
      callbacks.set(id, callback as () => void)
      return id
    })

    cancelIdleCallbackSpy = spyOn(window, 'cancelIdleCallback').and.callFake((id) => {
      callbacks.delete(id)
    })

    registerCleanupTask(() => {
      requestIdleCallbackSpy?.calls.reset()
      cancelIdleCallbackSpy?.calls.reset()
      callbacks.clear()
    })
  }

  return {
    triggerIdleCallbacks: () => {
      callbacks.forEach((callback) => callback())
    },
    cancelIdleCallbackSpy,
  }
}
