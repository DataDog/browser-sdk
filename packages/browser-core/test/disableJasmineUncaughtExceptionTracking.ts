import { noop } from '@datadog/js-core/util'
import { registerCleanupTask } from './registerCleanupTask'

/**
 * Disable Jasmine's uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow, but Jasmine also catch them and
 * fails the test.
 *
 * Replace the handler instead of spying on it, so tests can still replace `window.onerror`. Tests
 * must not spy on it after calling this: Jasmine restores spies after the cleanup tasks run, so it
 * would put back the disabled handler.
 *
 * This is the Karma implementation. When running with Vitest, this module is aliased to
 * `test/unit-vitest/disableJasmineUncaughtExceptionTracking.ts` (see `test/unit-vitest/vite.config.ts`).
 */
export function disableJasmineUncaughtExceptionTracking() {
  const originalOnError = window.onerror
  window.onerror = noop
  registerCleanupTask(() => {
    window.onerror = originalOnError
  })
}
