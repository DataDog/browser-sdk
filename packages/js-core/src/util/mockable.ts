declare const __BUILD_ENV__SDK_VERSION__: string

/**
 * A registry of test-time mock replacements, keyed by the original value.
 *
 * In production builds this map is never populated. In test builds,
 * {@link mockable} reads from it to return the registered replacement instead
 * of the real value.
 *
 * Exposed so that test helpers (e.g. `replaceMockable`) can register and clean
 * up replacements without coupling them to this module's implementation.
 */
export const mockableReplacements = new Map<unknown, unknown>()

/**
 * Wraps a value to make it replaceable in tests without changing its type.
 *
 * In production builds this is a no-op that returns `value` as-is. In test
 * builds it checks {@link mockableReplacements} and returns the registered
 * replacement if one exists, otherwise falls through to the real value.
 *
 * @param value - The real value (a function, object, or primitive) to wrap.
 * @returns The replacement registered for `value` in test builds, or `value`
 * itself in production and when no replacement is registered.
 * @example
 * // In source file:
 * import { mockable } from '@datadog/js-core/util'
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
