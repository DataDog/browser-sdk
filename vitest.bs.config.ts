import path from 'node:path'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { getBuildInfos } from './test/envUtils.ts'
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { browserConfigurations } from './test/unit/browsers.conf.ts'
import packageJson from './package.json' with { type: 'json' }

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

    exclude: [
      'packages/core/src/domain/error/trackRuntimeError.spec.ts',
      'packages/core/src/tools/taskQueue.spec.ts',
      '**/node_modules/**',
    ],

    restoreMocks: true,

    setupFiles: ['./test/unit/vitest.setup.ts'],

    sequence: {
      shuffle: true,
    },
  },
})
