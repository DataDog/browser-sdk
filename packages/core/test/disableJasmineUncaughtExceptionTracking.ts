import { registerCleanupTask } from './registerCleanupTask'

/**
 * Disable uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow.
 */
export function disableJasmineUncaughtExceptionTracking() {
  const originalOnerror = window.onerror
  window.onerror = null
  registerCleanupTask(() => {
    window.onerror = originalOnerror
  })
}
