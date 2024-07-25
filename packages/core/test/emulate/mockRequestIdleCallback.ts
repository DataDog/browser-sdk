import { registerCleanupTask } from '../registerCleanupTask'

let requestIdleCallbackSpy: jasmine.Spy
let cancelIdleCallbackSpy: jasmine.Spy

export function mockRequestIdleCallback() {
  const callbacks = new Map<number, () => void>()

  let idCounter = 0

  function addCallback(callback: (...params: any[]) => any) {
    const id = ++idCounter
    callbacks.set(id, callback)
    return id
  }

  function removeCallback(id: number) {
    callbacks.delete(id)
  }

  if (!window.requestIdleCallback || !window.cancelIdleCallback) {
    requestIdleCallbackSpy = spyOn(window, 'requestAnimationFrame').and.callFake(addCallback)
    cancelIdleCallbackSpy = spyOn(window, 'cancelAnimationFrame').and.callFake(removeCallback)
  } else {
    requestIdleCallbackSpy = spyOn(window, 'requestIdleCallback').and.callFake(addCallback)
    cancelIdleCallbackSpy = spyOn(window, 'cancelIdleCallback').and.callFake(removeCallback)
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
