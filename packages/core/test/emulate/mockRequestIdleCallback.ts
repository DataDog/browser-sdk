import { registerCleanupTask } from '../registerCleanupTask'

export function mockRequestIdleCallback() {
  const callbacks = new Map<number, () => void>()

  const requestIdleCallbackSpy = spyOn(window, 'requestIdleCallback').and.callFake((callback) => {
    const id = Math.random()
    callbacks.set(id, callback as () => void)
    return id
  })

  const cancelIdleCallbackSpy = spyOn(window, 'cancelIdleCallback').and.callFake((id) => {
    callbacks.delete(id)
  })

  registerCleanupTask(() => {
    requestIdleCallbackSpy.calls.reset()
    cancelIdleCallbackSpy.calls.reset()
    callbacks.clear()
  })

  return {
    triggerIdleCallbacks: () => {
      callbacks.forEach((callback) => callback())
    },
  }
}
