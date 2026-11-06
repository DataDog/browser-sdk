/**
 * Registry of replacements used by {@link mockable}.
 *
 * Exposed so test helpers (e.g. `replaceMockable` from `@datadog/browser-core/test`) can clean up mocks.
 */
export const mockableReplacements = new Map<unknown, unknown>()

/**
 * Wraps a value to make it replaceable at runtime. Returns the replacement registered with
 * {@link replaceMockable} if any, otherwise the value as-is.
 *
 * @param value - The value to wrap
 * @returns The registered replacement, or `value` if none
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
  return mockableReplacements.has(value) ? (mockableReplacements.get(value) as T) : value
}

/**
 * Replaces a value wrapped with {@link mockable}. Used by tests, and by integrations (e.g. the
 * Shopify app pixel plugin) to inject host-specific implementations. `value` must be the same
 * reference passed to `mockable()`.
 *
 * @param value - The original value, as passed to `mockable()`
 * @param replacement - The value `mockable(value)` returns from now on
 */
export function replaceMockable<T>(value: T, replacement: T): void {
  mockableReplacements.set(value, replacement)
}
