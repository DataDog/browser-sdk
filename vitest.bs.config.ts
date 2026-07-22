import path from 'node:path'
import { registerHooks } from 'node:module'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/* eslint-disable local-rules/disallow-test-import-export-from-src -- Vitest configuration composes test infrastructure. */
import { getBuildInfos } from './test/envUtils.ts'
import { browserConfigurations as allBrowserConfigurations } from './test/unit/browsers.conf.ts'
import { UnitTestReporter, recordUnexpectedConsoleLog } from './scripts/test/lib/unitTestReporter.ts'
import { getBrowserStackInstance } from './scripts/test/lib/browserstackUnitConfig.ts'
/* eslint-enable local-rules/disallow-test-import-export-from-src */
import { getBuildEnvValue } from './scripts/lib/buildEnv.ts'

const browserStackPlaywrightVersion = '1.59.1'

// The E2E suite follows the latest Playwright, while BrowserStack currently supports an older
// client. Redirect only the Vitest provider's lazy Playwright import to the separately pinned
// package, leaving every other Playwright consumer untouched.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'playwright' && context.parentURL?.includes('/@vitest/browser-playwright/')) {
      return nextResolve('playwright-browserstack', context)
    }
    return nextResolve(specifier, context)
  },
})

// Filter to a single browser when BS_BROWSER is set (CI parallel matrix).
// Without this, all browsers run in a single Vitest process.
const selectedBrowser = process.env.BS_BROWSER
const browserConfigurations = selectedBrowser
  ? allBrowserConfigurations.filter((c) => c.id === selectedBrowser)
  : allBrowserConfigurations

if (selectedBrowser && browserConfigurations.length === 0) {
  const availableIds = allBrowserConfigurations.map((c) => c.id).join(', ')
  throw new Error(`Unknown BS_BROWSER "${selectedBrowser}". Available: ${availableIds}`)
}

// Build env variables that should be replaced at compile time (same as webpack.base.ts)
const buildEnvDefines: Record<string, string> = {
  __BUILD_ENV__SDK_VERSION__: JSON.stringify('test'),
  __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
  __BUILD_ENV__WORKER_STRING__: JSON.stringify(getBuildEnvValue('WORKER_STRING')),
}

function createBrowserStackInstance(configuration: (typeof browserConfigurations)[number]) {
  return getBrowserStackInstance(configuration, {
    username: process.env.BS_USERNAME,
    accessKey: process.env.BS_ACCESS_KEY,
    localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER,
    build: getBuildInfos(),
    playwrightVersion: browserStackPlaywrightVersion,
  })
}

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

  // Transpile project modules to the syntax level supported by the oldest branded browsers in
  // the matrix. The Vitest client itself still determines the runner's documented browser floor.
  // See https://github.com/vitest-dev/vitest/issues/4304
  oxc: {
    target: 'es2020',
  },

  optimizeDeps: {
    include: ['pako'],
  },

  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      // Use bs-local.com instead of localhost so Safari on BrowserStack can access cookies.
      // BrowserStack replaces localhost with bs-local.com for Safari, which breaks cookie-based
      // tests when the server hostname doesn't match.
      // See https://www.browserstack.com/support/faq/local-testing/local-exceptions/i-face-issues-while-testing-localhost-urls-or-private-servers-in-safari-on-macos-os-x-and-ios
      api: {
        host: 'bs-local.com',
      },
      // Vitest's orchestrator and tester iframe have separate globals, so both need the bootstrap.
      // Keep this a classic script so it executes before Vitest's module bundle.
      orchestratorScripts: [
        {
          src: path.resolve('./test/unit/vitestBrowserPolyfills.js'),
          type: 'text/javascript',
        },
      ],
      testerHtmlPath: './test/unit/vitest.tester.html',
      instances: browserConfigurations.map(createBrowserStackInstance),
    },

    // Exclude developer-extension: only compatible with Chrome, no point testing on other browsers
    include: ['packages/*/{src,test}/**/*.spec.{ts,tsx}'],

    exclude: ['**/node_modules/**'],

    restoreMocks: true,

    // Many SDK modules intentionally expose test-only reset hooks for process-wide browser state
    // and are not safe across parallel files.
    fileParallelism: false,

    setupFiles: ['./test/unit/browserstack.keepalive.ts', './test/unit/vitest.setup.ts'],

    sequence: {
      shuffle: true,
    },

    onConsoleLog: process.env.CI ? recordUnexpectedConsoleLog : undefined,

    reporters: process.env.CI
      ? ['verbose', ['junit', { outputFile: 'test-report/unit-bs/results.xml' }], new UnitTestReporter()]
      : ['default', new UnitTestReporter()],
  },
})
