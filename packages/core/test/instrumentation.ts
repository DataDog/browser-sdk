import { getObserversForMethod } from '../src/tools/instrumentMethod'

/**
 * @returns a fluent interface for asserting that the given callback adds
 * instrumentation to certain methods. Usage:
 * > callbackAddsInstrumentation(() => {
 * >   // ... code that's intended to instrument window.foo ...
 * > }).toMethod(window, 'foo').whenCalled()
 */
export function callbackAddsInstrumentation(callback: () => void) {
  const existingMethods: Array<[any, string, number]> = []
  const expectation = {
    callback,
    toMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET & string>(
      target: TARGET,
      method: METHOD
    ) {
      const originalCount = getObserversForMethod(target, method).length
      existingMethods.push([target, method, originalCount])
      return expectation
    },
    whenCalled() {
      callback()
      return existingMethods.every(
        ([target, method, originalCount]) => getObserversForMethod(target, method).length !== originalCount
      )
    },
  }
  return expectation
}
