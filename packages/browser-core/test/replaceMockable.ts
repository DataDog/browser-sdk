import { vi, type Mock } from 'vitest'
import { mockableReplacements } from '../src/tools/mockable'
import { registerCleanupTask } from './registerCleanupTask'

/**
 * Registers a mock replacement for a mockable value. The mock is automatically
 * cleaned up after each test via registerCleanupTask.
 *
 * @param value - The original value (must be the same reference passed to mockable())
 * @param replacement - The mock replacement
 * @example
 * import { replaceMockable } from '@datadog/browser-core/test'
 * import { trackRuntimeError } from '../domain/error/trackRuntimeError'
 *
 * it('...', () => {
 *   replaceMockable(trackRuntimeError, () => new Observable<RawError>())
 *   // ... test code ...
 * })
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
 * Creates a Vitest mock function and registers it as a mock replacement for a mockable function.
 * The mock is automatically cleaned up after each test via registerCleanupTask.
 *
 * @param value - The original function (must be the same reference passed to mockable())
 * @returns A Vitest mock function that can be used for assertions
 * @example
 * import { replaceMockableWithSpy } from '@datadog/browser-core/test'
 * import { trackRuntimeError } from '../domain/error/trackRuntimeError'
 *
 * it('...', () => {
 *   const spy = replaceMockableWithSpy(trackRuntimeError)
 *   // ... test code ...
 *   expect(spy).toHaveBeenCalled()
 * })
 */
export function replaceMockableWithSpy<T extends (...args: any[]) => any>(value: T): Mock<T> {
  const spy = vi.fn<T>()
  replaceMockable(value, spy as unknown as T)
  return spy
}
