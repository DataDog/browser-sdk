import path from 'node:path'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Build env variables that should be replaced at compile time (same as webpack.base.ts)
const buildEnvDefines: Record<string, string> = {
  __BUILD_ENV__SDK_VERSION__: JSON.stringify('test'),
  __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
  // Worker string is built from packages/worker — provide empty string for unit tests
  __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
}

export default defineConfig({
  resolve: {
    alias: {
      // Test utility subpath imports (must come before main package aliases)
      '@datadog/browser-core/test': path.resolve('./packages/core/test'),
      '@datadog/browser-rum-core/test': path.resolve('./packages/rum-core/test'),

      // Main package aliases (matching tsconfig.base.json paths)
      '@datadog/browser-core': path.resolve('./packages/core/src'),
      '@datadog/browser-flagging': path.resolve('./packages/flagging/src/entries/main'),
      '@datadog/browser-logs': path.resolve('./packages/logs/src/entries/main'),
      '@datadog/browser-rum-core': path.resolve('./packages/rum-core/src'),
      '@datadog/browser-rum/internal': path.resolve('./packages/rum/src/entries/internal'),
      '@datadog/browser-rum/internal-synthetics': path.resolve('./packages/rum/src/entries/internalSynthetics'),
      '@datadog/browser-rum': path.resolve('./packages/rum/src/entries/main'),
      '@datadog/browser-rum-slim': path.resolve('./packages/rum-slim/src/entries/main'),
      '@datadog/browser-rum-react/react-router-v6': path.resolve('./packages/rum-react/src/entries/reactRouterV6'),
      '@datadog/browser-rum-react/react-router-v7': path.resolve('./packages/rum-react/src/entries/reactRouterV7'),
      '@datadog/browser-rum-react': path.resolve('./packages/rum-react/src/entries/main'),
      '@datadog/browser-worker': path.resolve('./packages/worker/src/entries/main'),
    },
  },

  define: buildEnvDefines,

  optimizeDeps: {
    include: ['pako'],
  },

  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },

    include: ['packages/*/{src,test}/**/*.spec.{ts,tsx}', 'developer-extension/{src,test}/**/*.spec.{ts,tsx}'],

    exclude: [
      // trackRuntimeError.spec.ts intentionally throws errors and unhandled rejections
      // which crash the Vitest browser page (no equivalent of Jasmine's uncaught exception handling)
      'packages/core/src/domain/error/trackRuntimeError.spec.ts',
      // taskQueue.spec.ts crashes the browser page during module import (pre-existing issue)
      'packages/core/src/tools/taskQueue.spec.ts',
      '**/node_modules/**',
    ],

    // Auto-restore all spies after each test (matches Jasmine's auto-restore behavior)
    restoreMocks: true,

    setupFiles: ['./test/unit/vitest.setup.ts'],

    // Match Karma's randomized test order
    sequence: {
      shuffle: true,
    },

    // Note: Karma used stopSpecOnExpectationFailure, but Vitest's bail stops the entire run.
    // Use --bail on CLI when needed for fast feedback during development.
  },
})
