/**
 * Main entry point for instrumentation overhead benchmark
 * Exposes both instrumented and non-instrumented functions to window
 */

import * as nonInstrumented from './functions'
import * as instrumented from './instrumented'

declare global {
  interface Window {
    testFunctions: {
      add1: (a: number, b: number) => number
      add2: (a: number, b: number) => number
    }
    USE_INSTRUMENTED?: boolean
  }
}

// Expose functions to window based on configuration
// The benchmark will set USE_INSTRUMENTED flag before loading this script
if (typeof window !== 'undefined') {
  window.testFunctions = window.USE_INSTRUMENTED ? instrumented : nonInstrumented
}
