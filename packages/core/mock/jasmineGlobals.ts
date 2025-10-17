/**
 * Global Jasmine API Setup for Vitest
 * 
 * This file sets up global variables to match Jasmine's API, allowing tests
 * to use Jasmine syntax without modifications.
 * 
 * To use this, add it to your vitest.config.ts:
 * ```typescript
 * export default defineConfig({
 *   test: {
 *     setupFiles: ['./packages/core/mock/jasmineGlobals.ts'],
 *   },
 * })
 * ```
 * 
 * Or import it at the top of your test file:
 * ```typescript
 * import './path/to/jasmineGlobals'
 * ```
 */

import * as jasmineAdapter from './jasmineAdapter'
import { setupJasmineMatchers } from './jasmineMatchers'

// Set up custom Jasmine matchers
setupJasmineMatchers()

// Assign to global scope to make Jasmine APIs available globally
;(globalThis as any).jasmine = jasmineAdapter.jasmine
;(globalThis as any).spyOn = jasmineAdapter.spyOn
;(globalThis as any).spyOnProperty = jasmineAdapter.spyOnProperty

// Export empty object to make this a module and avoid global scope pollution
export {}
