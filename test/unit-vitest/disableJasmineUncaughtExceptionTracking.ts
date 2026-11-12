import { noop } from '@datadog/js-core/util'
import { registerCleanupTask } from './registerCleanupTask'

/**
 * Vitest implementation of `packages/browser-core/test/disableJasmineUncaughtExceptionTracking.ts`,
 * swapped in through a `resolve.alias` in `vite.config.ts`. The Karma implementation replaces
 * `window.onerror` (where Jasmine catches errors), but Vitest catches them with `error` /
 * `unhandledrejection` listeners in `@vitest/browser`'s `error-catcher.js` instead.
 *
 * That catcher ignores an error if the test code added its own listener for the event (it then
 * only logs it with `console.error`), see https://vitest.dev/guide/features.html#unhandled-errors
 * So we add no-op listeners and silence those `console.error` calls.
 */
export function disableJasmineUncaughtExceptionTracking() {
  window.addEventListener('error', noop)
  window.addEventListener('unhandledrejection', noop)
  const originalConsoleError = console.error
  console.error = (...args) => {
    if (new Error().stack!.includes('error-catcher.js')) {
      return
    }
    originalConsoleError(...args)
  }
  registerCleanupTask(() => {
    console.error = originalConsoleError
    window.removeEventListener('error', noop)
    window.removeEventListener('unhandledrejection', noop)
  })
}
