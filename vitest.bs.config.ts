import path from 'node:path'

import { webdriverio } from '@vitest/browser-webdriverio'
import { defineConfig } from 'vitest/config'

// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { getBuildInfos } from './test/envUtils.ts'
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { browserConfigurations } from './test/unit/browsers.conf.ts'

// Build env variables that should be replaced at compile time (same as webpack.base.ts)
const buildEnvDefines: Record<string, string> = {
  __BUILD_ENV__SDK_VERSION__: JSON.stringify('test'),
  __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
  // Worker string is built from packages/worker — provide empty string for unit tests
  __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
}

function getWebdriverBrowserName(name: string): 'chrome' | 'firefox' | 'safari' | 'edge' {
  const lower = name.toLowerCase()
  if (lower.includes('firefox')) { return 'firefox' }
  if (lower.includes('safari')) { return 'safari' }
  if (lower.includes('edge')) { return 'edge' }
  return 'chrome'
}

function getBrowserStackOptions(configuration: (typeof browserConfigurations)[number]) {
  return {
    os: configuration.os,
    osVersion: configuration.osVersion,
    browserVersion: configuration.version,
    projectName: 'browser sdk unit',
    buildName: getBuildInfos(),
    sessionName: configuration.sessionName,
    local: 'true',
    debug: 'false',
      consoleLogs: 'verbose',
    networkLogs: 'false',
    interactiveDebugging: 'false',
    ...(configuration.device ? { deviceName: configuration.device } : {}),
  }
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
      '@datadog/browser-rum-react/internal': path.resolve('./packages/rum-react/src/entries/internal'),
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
      // Use WebdriverIO instead of Playwright for BrowserStack. Playwright connects via CDP
      // websockets which BrowserStack drops after ~60s idle (vitest#10151). WebdriverIO uses
      // the WebDriver protocol — the same protocol Karma used — which is BrowserStack's native
      // and most stable integration.
      provider: webdriverio({
        protocol: 'https',
        hostname: 'hub-cloud.browserstack.com',
        port: 443,
        path: '/wd/hub',
        capabilities: {
          'bstack:options': {
            userName: process.env.BS_USERNAME,
            accessKey: process.env.BS_ACCESS_KEY,
          },
        },
      }),
      // Bind Vite server to 0.0.0.0 so BrowserStack Local tunnel can reach it.
      // The browser navigates to bs-local.com which resolves to 127.0.0.1 on both
      // the local machine and the BrowserStack machine (via the Local tunnel).
      api: {
        host: '0.0.0.0',
      },
      instances: browserConfigurations.map((config) => ({
        browser: getWebdriverBrowserName(config.name),
        name: config.sessionName,
        provider: webdriverio({
          protocol: 'https',
          hostname: 'hub-cloud.browserstack.com',
          port: 443,
          path: '/wd/hub',
          capabilities: {
            'bstack:options': {
              userName: process.env.BS_USERNAME,
              accessKey: process.env.BS_ACCESS_KEY,
              ...getBrowserStackOptions(config),
            },
          } as Record<string, unknown>,
        }),
      })),
    },

    // Exclude developer-extension: only compatible with Chrome, no point testing on other browsers
    include: ['packages/*/{src,test}/**/*.spec.{ts,tsx}'],

    exclude: ['packages/core/test/forEach.spec.ts', '**/node_modules/**'],

    restoreMocks: true,

    setupFiles: ['./test/unit/vitest.setup.ts'],

    sequence: {
      shuffle: true,
    },

    reporters: process.env.CI ? ['verbose', ['junit', { outputFile: 'test-report/unit-bs/results.xml' }]] : ['default'],
  },
})
