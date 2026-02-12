import { mockableReplacements } from '../src/tools/mockable'
import { registerCleanupTask } from './registerCleanupTask'

/**
 * Registers a mock replacement for a mockable value. The mock is automatically
 * cleaned up after each test via registerCleanupTask.
 *
 * @param value - The original value (must be the same reference passed to mockable())
 * @param replacement - The mock replacement
 * @example
 * import { mockValue } from '@datadog/browser-core/test'
 * import { trackRuntimeError } from '../domain/error/trackRuntimeError'
 *
 * mockValue(trackRuntimeError, () => new Observable<RawError>())
 */
export function replaceMockable<T>(value: T, replacement: T): void {
  if (mockableReplacements.has(value)) {
    throw new Error('Mock has already been set')
  }
  mockableReplacements.set(value, replacement)
  registerCleanupTask(() => {
    mockableReplacements.delete(value)
  })
}

/**
 * Creates a Jasmine spy and registers it as a mock replacement for a mockable function.
 * The mock is automatically cleaned up after each test via registerCleanupTask.
 *
 * @param value - The original function (must be the same reference passed to mockable())
 * @returns A Jasmine spy that can be used for assertions
 * @example
 * import { mockWithSpy } from '@datadog/browser-core/test'
 * import { trackRuntimeError } from '../domain/error/trackRuntimeError'
 *
 * const spy = mockWithSpy(trackRuntimeError)
 * spy.and.returnValue(new Observable<RawError>())
 * // ... test code ...
 * expect(spy).toHaveBeenCalled()
 */
export function replaceMockableWithSpy<T extends (...args: any[]) => any>(value: T): jasmine.Spy<T> {
  const spy = jasmine.createSpy<T>()
  replaceMockable(value, spy as unknown as T)
  return spy
}
