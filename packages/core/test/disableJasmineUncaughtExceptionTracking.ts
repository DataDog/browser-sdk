import { registerCleanupTask } from './registerCleanupTask'

/**
 * Disable Vitest's uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow, but Vitest also catch them and
 * fails the test.
 */
export function disableUncaughtExceptionTracking() {
  // Store original handlers
  const originalOnError = window.onerror
  const originalOnUnhandledRejection = window.onunhandledrejection
  
  // Replace error handlers to prevent Vitest from seeing intentional test errors
  // We can't use vi.spyOn on these properties due to "Illegal invocation" errors
  // So we directly replace them and restore in cleanup
  window.onerror = (() => true) as any // Return true to prevent default error handling
  window.onunhandledrejection = (() => {}) as any
  
  // Restore after the test
  registerCleanupTask(() => {
    window.onerror = originalOnError
    window.onunhandledrejection = originalOnUnhandledRejection
  })
}

// Keep legacy name for backward compatibility
export const disableJasmineUncaughtExceptionTracking = disableUncaughtExceptionTracking
