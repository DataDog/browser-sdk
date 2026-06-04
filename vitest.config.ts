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

// eslint-disable-next-line import-x/no-default-export
export default defineConfig({
  resolve: {
    alias: {
      // Test utility subpath imports (must come before main package aliases)
      '@datadog/browser-core/test': path.resolve('./packages/browser-core/test'),
      '@datadog/browser-rum-core/test': path.resolve('./packages/browser-rum-core/test'),

      // Main package aliases (matching tsconfig.base.json paths)
      '@datadog/browser-core': path.resolve('./packages/browser-core/src'),
      '@datadog/browser-flagging': path.resolve('./packages/browser-flagging/src/entries/main'),
      '@datadog/browser-logs': path.resolve('./packages/browser-logs/src/entries/main'),
      '@datadog/browser-rum-core': path.resolve('./packages/browser-rum-core/src'),
      '@datadog/browser-rum/internal': path.resolve('./packages/browser-rum/src/entries/internal'),
      '@datadog/browser-rum/internal-synthetics': path.resolve('./packages/browser-rum/src/entries/internalSynthetics'),
      '@datadog/browser-rum': path.resolve('./packages/browser-rum/src/entries/main'),
      '@datadog/browser-rum-slim': path.resolve('./packages/browser-rum-slim/src/entries/main'),
      '@datadog/browser-rum-react/react-router-v6': path.resolve('./packages/browser-rum-react/src/entries/reactRouterV6'),
      '@datadog/browser-rum-react/react-router-v7': path.resolve('./packages/browser-rum-react/src/entries/reactRouterV7'),
      '@datadog/browser-rum-react/internal': path.resolve('./packages/browser-rum-react/src/entries/internal'),
      '@datadog/browser-rum-react': path.resolve('./packages/browser-rum-react/src/entries/main'),
      '@datadog/browser-worker': path.resolve('./packages/browser-worker/src/entries/main'),
    },
  },

  define: {
    ...buildEnvDefines,
    // Some CJS modules use `global` for environment detection; map it to globalThis
    // so they patch the real window instead of an empty object.
    global: 'globalThis',
  },

  optimizeDeps: {
    include: ['pako'],
  },

  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // Empty body prevents DOM serialization tests from breaking on Vitest's default tester HTML
      testerHtmlPath: './test/unit/vitest.tester.html',
      instances: [{ browser: 'chromium' }],
    },

    include: ['packages/*/{src,test}/**/*.spec.{ts,tsx}', 'developer-extension/{src,test}/**/*.spec.{ts,tsx}'],

    exclude: [
      // forEach.spec.ts is the Jasmine-era global setup file, replaced by test/unit/vitest.setup.ts
      'packages/browser-core/test/forEach.spec.ts',
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

    reporters: process.env.CI ? ['default', ['junit', { outputFile: 'test-report/unit/results.xml' }]] : ['default'],
  },
})
