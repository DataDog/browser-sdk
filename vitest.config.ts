import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'

// Build env variables that should be replaced at compile time (same as webpack.base.ts)
// Note: SDK_VERSION is intentionally NOT defined here — tests set it at runtime via
// window.__BUILD_ENV__SDK_VERSION__ (see test/unit/vitest.setup.ts)
const buildEnvDefines: Record<string, string> = {
  __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
  // Worker string is built from packages/worker — provide empty string for unit tests
  __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
}

export default defineConfig({
  resolve: {
    alias: {
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
      instances: [{ browser: 'chromium' }],
    },

    include: [
      'packages/*/{src,test}/**/*.spec.{ts,tsx}',
      'developer-extension/{src,test}/**/*.spec.{ts,tsx}',
    ],

    // Exclude the Karma-specific global setup file (replaced by vitest.setup.ts)
    exclude: ['packages/core/test/forEach.spec.ts', '**/node_modules/**'],

    // Enable globals so existing spec files can use describe/it/expect without imports
    // (matches Jasmine's global API surface)
    globals: true,

    setupFiles: ['./test/unit/vitest.setup.ts'],

    // Match Karma's randomized test order
    sequence: {
      shuffle: true,
    },

    // Fail fast on first expectation failure (matches Karma's stopSpecOnExpectationFailure)
    bail: 1,
  },
})
