/**
 * Disable Jasmine's uncaught error handling. This is useful for test cases throwing exceptions or
 * unhandled rejections that are expected to be caught somehow, but Jasmine also catch them and
 * fails the test.
 */
export function disableJasmineUncaughtExceptionTracking() {
  spyOn(window as any, 'onerror')
}
