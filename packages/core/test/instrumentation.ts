/**
 * @returns a fluent interface for asserting that the given callback adds
 * instrumentation to certain methods. Usage:
 * > callbackAddsInstrumentation(() => {
 * >   // ... code that's intended to instrument window.foo ...
 * > }).toMethod(window, 'foo').whenCalled()
 */
export function callbackAddsInstrumentation(callback: () => void) {
  const existingMethods: Array<[any, string, unknown]> = []
  const expectation = {
    callback,
    toMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET & string>(
      target: TARGET,
      method: METHOD
    ) {
      existingMethods.push([target, method, target[method]])
      return expectation
    },
    whenCalled() {
      callback()
      return existingMethods.every(([target, method, original]) => target[method] !== original)
    },
  }
  return expectation
}
