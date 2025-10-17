import { vi } from 'vitest'

/**
 * Disable Vitest's uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow, but Vitest also catch them and
 * fails the test.
 */
export function disableJasmineUncaughtExceptionTracking() {
  vi.spyOn(window as any, 'onerror').mockImplementation(() => {})
}
