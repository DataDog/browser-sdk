declare const __BUILD_ENV__SDK_VERSION__: string

export const mockableReplacements = new Map<unknown, unknown>()

/**
 * Wraps a value to make it mockable in tests. In production builds, this is a no-op
 * that returns the value as-is. In test builds, it checks if a mock replacement has
 * been registered and returns that instead.
 *
 * @example
 * // In source file:
 * import { mockable } from '../tools/mockable'
 * export const getNavigationEntry = mockable(() => performance.getEntriesByType('navigation')[0])
 *
 * // In test file:
 * import { mockValue } from '@datadog/browser-core/test'
 * mockValue(getNavigationEntry, () => FAKE_NAVIGATION_ENTRY)
 */
export function mockable<T>(value: T): T {
  // In test builds, return a wrapper that checks for mocks at call time
  if (__BUILD_ENV__SDK_VERSION__ === 'test' && mockableReplacements.get(value)) {
    return mockableReplacements.get(value)! as T
  }
  // In production, return the value as-is
  return value
}
