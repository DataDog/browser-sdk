import { noop } from '../../packages/core/src/tools/utils/functionUtils'
import { registerCleanupTask } from './registerCleanupTask'

/**
 * Vitest will ignore uncaught errors if we add our own listener, see
 * https://vitest.dev/guide/features.html#unhandled-errors
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
