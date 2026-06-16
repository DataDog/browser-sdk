import path from 'node:path'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { getBuildInfos } from './test/envUtils.ts'
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { browserConfigurations as allBrowserConfigurations } from './test/unit/browsers.conf.ts'
import packageJson from './package.json' with { type: 'json' }

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
  // Worker string is built from packages/worker — provide empty string for unit tests
  __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
}

function getPlaywrightBrowserName(name: string): 'chromium' | 'firefox' | 'webkit' {
  if (name.toLowerCase().includes('firefox')) {
    return 'firefox'
  }
  if (name.toLowerCase().includes('safari') || name.toLowerCase().includes('webkit')) {
    return 'webkit'
  }
  return 'chromium'
}

function getCapabilities(configuration: (typeof browserConfigurations)[number]) {
  const rootPkg = packageJson as unknown as { devDependencies?: Record<string, string> }
  const playwrightVersion = rootPkg.devDependencies?.['@playwright/test'] ?? 'latest'
  return {
    os: configuration.os,
    os_version: configuration.osVersion,
    browser: configuration.name,
    browser_version: configuration.version,
    'browserstack.username': process.env.BS_USERNAME,
    'browserstack.accessKey': process.env.BS_ACCESS_KEY,
    project: 'browser sdk unit',
    build: getBuildInfos(),
    name: configuration.sessionName,
    'browserstack.local': true,
    'browserstack.localIdentifier': process.env.BROWSERSTACK_LOCAL_IDENTIFIER || '',
    'browserstack.playwrightVersion': playwrightVersion,
    'client.playwrightVersion': playwrightVersion,
    'browserstack.debug': false,
    'browserstack.console': 'info',
    'browserstack.networkLogs': false,
    'browserstack.interactiveDebugging': false,
  }
}

export default defineConfig({
  resolve: {
    alias: {
      // Test utility subpath imports (must come before main package aliases)
      '@datadog/browser-core/test': path.resolve('./packages/browser-core/test'),
      '@datadog/browser-rum-core/test': path.resolve('./packages/browser-rum-core/test'),

      // Main package aliases (matching tsconfig.base.json paths)
      '@datadog/js-core/time': path.resolve('./packages/js-core/src/entries/time'),
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

  define: buildEnvDefines,

  // Transpile Vitest's browser client and dependencies to ES2020 so they run on older
  // BrowserStack browsers (Chrome 80, Edge 80, Firefox 78). Without this, Vitest's client.js
  // uses ??= and #privateFields which these browsers can't parse.
  // See https://github.com/vitest-dev/vitest/issues/4304
  esbuild: {
    target: 'es2020',
  },

  optimizeDeps: {
    include: ['pako'],
    esbuildOptions: {
      target: 'es2020',
    },
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
      instances: browserConfigurations.map((config) => ({
        browser: getPlaywrightBrowserName(config.name),
        name: config.sessionName,
        playwright: {
          connectOptions: {
            wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(getCapabilities(config)))}`,
          },
        },
      })),
    },

    // Exclude developer-extension: only compatible with Chrome, no point testing on other browsers
    include: ['packages/*/{src,test}/**/*.spec.{ts,tsx}'],

    exclude: ['packages/browser-core/test/forEach.spec.ts', '**/node_modules/**'],

    restoreMocks: true,

    setupFiles: ['./test/unit/vitest.setup.ts'],

    sequence: {
      shuffle: true,
    },

    reporters: process.env.CI ? ['verbose', ['junit', { outputFile: 'test-report/unit-bs/results.xml' }]] : ['default'],
  },
})
