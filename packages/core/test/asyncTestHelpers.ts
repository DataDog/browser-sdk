/**
 * Vitest doesn't support done() callbacks. This helper converts done-based async patterns
 * to promise-based patterns for Vitest compatibility.
 */

/**
 * Wraps a callback-based async function to return a promise.
 * Use this to convert tests that use done() callbacks to promise-based tests.
 * 
 * @example
 * // Old Jasmine pattern:
 * it('should do something', (done) => {
 *   doSomethingAsync(() => {
 *     expect(result).toBe(expected)
 *     done()
 *   })
 * })
 * 
 * // New Vitest pattern:
 * it('should do something', () => {
 *   return waitFor((resolve) => {
 *     doSomethingAsync(() => {
 *       expect(result).toBe(expected)
 *       resolve()
 *     })
 *   })
 * })
 */
export function waitFor<T = void>(
  callback: (resolve: (value: T) => void, reject: (error: any) => void) => void,
  timeoutMs: number = 5000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`waitFor() timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const wrappedResolve = (value: T) => {
      clearTimeout(timer)
      resolve(value)
    }

    const wrappedReject = (error: any) => {
      clearTimeout(timer)
      reject(error)
    }

    try {
      callback(wrappedResolve, wrappedReject)
    } catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  })
}

/**
 * Simplified version of waitFor for callbacks that don't need reject.
 * Most common use case for converting done() callbacks.
 * 
 * @example
 * it('should do something', async () => {
 *   await whenCalled((done) => {
 *     doSomethingAsync(() => {
 *       expect(result).toBe(expected)
 *       done()
 *     })
 *   })
 * })
 */
export function whenCalled(
  callback: (done: () => void) => void,
  timeoutMs: number = 5000
): Promise<void> {
  return waitFor<void>((resolve, reject) => {
    callback(resolve)
  }, timeoutMs)
}

