import { mockableReplacements } from '../src/util/mockable'
import { registerCleanupTask } from './registerCleanupTask'

/**
 * Registers a mock replacement for a mockable value during a test.
 * Automatically cleaned up after each test via registerCleanupTask.
 *
 * @param value - The original value (must be the same reference passed to mockable()).
 * @param replacement - The mock replacement.
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
