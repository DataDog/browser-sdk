import path from 'node:path'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { UnitTestReporter, recordUnexpectedConsoleLog } from './scripts/test/lib/unitTestReporter.ts'
import { getBuildEnvValue } from './scripts/lib/buildEnv.ts'
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { getCoverageReportDirectory } from './test/envUtils.ts'

// Build env variables that should be replaced at compile time (same as webpack.base.ts)
const buildEnvDefines: Record<string, string> = {
  __BUILD_ENV__SDK_VERSION__: JSON.stringify('test'),
  __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
  __BUILD_ENV__WORKER_STRING__: JSON.stringify(getBuildEnvValue('WORKER_STRING')),
}
const localBrowser = (process.env.VITEST_BROWSER as 'chromium' | 'firefox' | 'webkit' | undefined) ?? 'chromium'

// eslint-disable-next-line import-x/no-default-export
export default defineConfig({
  resolve: {
    alias: {
      // Test utility subpath imports (must come before main package aliases)
      '@datadog/browser-core/test': path.resolve('./packages/browser-core/test'),
      '@datadog/browser-rum-core/test': path.resolve('./packages/browser-rum-core/test'),

      // Main package aliases (matching tsconfig.base.json paths)
      '@datadog/js-core/assembly': path.resolve('./packages/js-core/src/entries/assembly'),
      '@datadog/js-core/time': path.resolve('./packages/js-core/src/entries/time'),
      '@datadog/js-core/monitor': path.resolve('./packages/js-core/src/entries/monitor'),
      '@datadog/js-core/transport': path.resolve('./packages/js-core/src/entries/transport'),
      '@datadog/js-core/util': path.resolve('./packages/js-core/src/entries/util'),
      '@datadog/browser-core': path.resolve('./packages/browser-core/src'),
      '@datadog/browser-flagging': path.resolve('./packages/browser-flagging/src/entries/main'),
      '@datadog/browser-logs': path.resolve('./packages/browser-logs/src/entries/main'),
      '@datadog/browser-rum-core': path.resolve('./packages/browser-rum-core/src'),
      '@datadog/browser-rum/internal': path.resolve('./packages/browser-rum/src/entries/internal'),
      '@datadog/browser-rum/internal-synthetics': path.resolve('./packages/browser-rum/src/entries/internalSynthetics'),
      '@datadog/browser-rum': path.resolve('./packages/browser-rum/src/entries/main'),
      '@datadog/browser-rum-slim': path.resolve('./packages/browser-rum-slim/src/entries/main'),
      '@datadog/browser-rum-react/react-router-v6': path.resolve(
        './packages/browser-rum-react/src/entries/reactRouterV6'
      ),
      '@datadog/browser-rum-react/react-router-v7': path.resolve(
        './packages/browser-rum-react/src/entries/reactRouterV7'
      ),
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
      instances: [{ browser: localBrowser }],
    },

    include: ['packages/*/{src,test}/**/*.spec.{ts,tsx}', 'developer-extension/{src,test}/**/*.spec.{ts,tsx}'],

    exclude: ['**/node_modules/**'],

    // Auto-restore all spies after each test.
    restoreMocks: true,

    // Browser SDK tests share module-level state. Running files concurrently can make one suite
    // mutate another suite's globals and mocks.
    fileParallelism: false,

    coverage: {
      enabled: true,
      provider: 'istanbul',
      reportsDirectory: getCoverageReportDirectory(),
      reporter: ['text-summary', 'html', ...(process.env.CI ? ['clover'] : [])],
      exclude: ['**/*.spec.{ts,tsx}', '**/*.specHelper.{ts,tsx}', '**/*.d.ts', '**/capturedExceptions.ts'],
    },

    setupFiles: ['./test/unit/vitest.setup.ts'],

    // Randomize test order so isolation issues are reproducible with a printed seed.
    sequence: {
      shuffle: true,
    },

    onConsoleLog: process.env.CI ? recordUnexpectedConsoleLog : undefined,

    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: 'test-report/unit/results.xml' }], new UnitTestReporter()]
      : ['default', new UnitTestReporter()],
  },
})
