import { registerCleanupTask } from '../registerCleanupTask'

let requestIdleCallbackSpy: jasmine.Spy
let cancelIdleCallbackSpy: jasmine.Spy

export function mockRequestIdleCallback() {
  const callbacks = new Map<number, () => void>()

  if (!window.requestIdleCallback || !window.cancelIdleCallback) {
    requestIdleCallbackSpy = spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      const id = Math.random()
      callbacks.set(id, callback as () => void)
      return id
    })

    cancelIdleCallbackSpy = spyOn(window, 'cancelAnimationFrame').and.callFake((id) => {
      callbacks.delete(id)
    })
  } else {
    requestIdleCallbackSpy = spyOn(window, 'requestIdleCallback').and.callFake((callback) => {
      const id = Math.random()
      callbacks.set(id, callback as () => void)
      return id
    })

    cancelIdleCallbackSpy = spyOn(window, 'cancelIdleCallback').and.callFake((id) => {
      callbacks.delete(id)
    })
  }

  registerCleanupTask(() => {
    requestIdleCallbackSpy.calls.reset()
    cancelIdleCallbackSpy.calls.reset()
    callbacks.clear()
  })

  return {
    triggerIdleCallbacks: () => {
      callbacks.forEach((callback) => callback())
    },
    cancelIdleCallbackSpy,
  }
}
