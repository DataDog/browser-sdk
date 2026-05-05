import { registerCleanupTask } from './registerCleanupTask'

/**
 * Disable uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow.
 *
 * In Vitest browser mode, setting window.onerror = null is not enough because Vitest
 * registers its own 'error' and 'unhandledrejection' event listeners to track uncaught
 * errors. We add capturing listeners that call preventDefault() to mark errors as handled
 * without blocking window.onerror (which the tests need).
 */
export function disableJasmineUncaughtExceptionTracking() {
  const originalOnerror = window.onerror
  window.onerror = null

  // Use only preventDefault() — NOT stopImmediatePropagation().
  // preventDefault() marks the error as "handled" without blocking other listeners.
  // stopImmediatePropagation() would block window.onerror which the tests need.
  const suppressError = (event: Event) => {
    event.preventDefault()
  }

  window.addEventListener('error', suppressError, true)
  window.addEventListener('unhandledrejection', suppressError, true)

  registerCleanupTask(() => {
    window.onerror = originalOnerror
    window.removeEventListener('error', suppressError, true)
    window.removeEventListener('unhandledrejection', suppressError, true)
  })
}
