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
 * export function formatNavigationEntry(): string {
 *   const navigationEntry = mockable(getNavigationEntry)()
 *   ...
 * }
 *
 * // In test file:
 * import { replaceMockable } from '@datadog/browser-core/test'
 * it('...', () => {
 *   replaceMockable(getNavigationEntry, () => FAKE_NAVIGATION_ENTRY)
 *   expect(formatNavigationEntry()).toEqual(...)
 * })
 */
export function mockable<T>(value: T): T {
  // In test builds, return a wrapper that checks for mocks at call time
  if (__BUILD_ENV__SDK_VERSION__ === 'test' && mockableReplacements.has(value)) {
    return mockableReplacements.get(value)! as T
  }
  // In production, return the value as-is
  return value
}
