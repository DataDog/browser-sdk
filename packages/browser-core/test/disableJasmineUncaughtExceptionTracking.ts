import { noop } from '../src/tools/utils/functionUtils'
import { registerCleanupTask } from './registerCleanupTask'

/**
 * Disable Jasmine's uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow, but Jasmine also catch them and
 * fails the test.
 *
 * Replace the handler instead of spying on it, so tests can still spy on `window.onerror`.
 */
export function disableJasmineUncaughtExceptionTracking() {
  const originalOnError = window.onerror
  window.onerror = noop
  registerCleanupTask(() => {
    window.onerror = originalOnError
  })
}
