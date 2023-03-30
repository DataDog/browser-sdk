import { instrumentMethod, noop } from '../../src'

/**
 * Opt out of jasmine uncaught error interception during test. This is useful for tests that are
 * instrumenting `window.onerror`. See https://github.com/jasmine/jasmine/pull/1860 for more
 * information.
 */
export function disableJasmineUncaughtErrorHandler() {
  const { stop } = instrumentMethod(window, 'onerror', () => noop)
  return {
    reset: stop,
  }
}
