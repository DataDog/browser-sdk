import { vi } from 'vitest'

/**
 * Disable uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow.
 */
export function disableJasmineUncaughtExceptionTracking() {
  vi.spyOn(window as any, 'onerror').mockImplementation(() => {})
}
