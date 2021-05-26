import { DOMMutation } from '../src/browser/domMutationObservable'

export interface DOMMutationStub extends DOMMutation {
  notify: () => void
}

export function createDomMutationStub(): DOMMutationStub {
  let callbacks: Array<() => void> = []

  function notify() {
    callbacks.forEach((callback) => callback())
  }

  return {
    notify,
    subscribe: (callback: () => void) => {
      callbacks.push(callback)
      return {
        unsubscribe: () => {
          callbacks = callbacks.filter((other) => callback !== other)
        },
      }
    },
  }
}
