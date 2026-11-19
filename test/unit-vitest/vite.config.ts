/// <reference path="./providedContext.d.ts" />
import { resolve } from 'path'
import ts from 'typescript'
import { defineConfig, type ViteUserConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { getBuildEnvDefines } from '../../scripts/lib/buildEnv.ts'
import { getCoverageReportDirectory, getTestReportDirectory } from '../envUtils.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const testReportDirectory = getTestReportDirectory()

// Resolve package entry points the same way as TypeScript (tsconfig.base.json `paths`)
function getTsconfigPathsAliases() {
  const { config } = ts.readConfigFile(resolve(ROOT, 'tsconfig.base.json'), (path) => ts.sys.readFile(path))
  const paths = (config as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions.paths
  return Object.entries(paths).map(([name, [target]]) => ({
    find: new RegExp(`^${name.replace(/[/.]/g, '\\$&')}$`),
    replacement: resolve(ROOT, target),
  }))
}

const config: ViteUserConfig = {
  test: {
    include: ['packages/*/@(src|test)/**/*.spec.@(ts|tsx)', 'developer-extension/@(src|test)/**/*.spec.@(ts|tsx)'],

    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      // Use an empty tester HTML file to avoid interfering with unit tests that serialize the whole
      // document
      testerHtmlPath: resolve(import.meta.dirname, 'vitest.tester.html'),
      screenshotFailures: false,
    },

    setupFiles: [
      resolve(import.meta.dirname, 'vitest.setup.ts'),
      resolve(ROOT, 'packages/browser-core/test/forEach.ts'),
    ],
    restoreMocks: true,

    // Run all test files in the same page. Tests are kept independent by the global
    // cleanup in forEach.ts and `registerCleanupTask()`, and reloading the page for each file is
    // what makes isolated runs slow.
    isolate: false,

    // Run files and tests in random order. Reproduce an order with `--sequence.seed=<seed>`. Run the
    // setup files in order (Vitest runs them in parallel by default): the hooks of vitest.setup.ts
    // must be registered before the ones of forEach.ts.
    sequence: { shuffle: { files: true, tests: true }, setupFiles: 'list' },

    provide: {
      // Fail tests calling console methods without spying on them (CI only)
      failOnUnexpectedConsoleCalls: Boolean(process.env.CI),
    },

    reporters: testReportDirectory
      ? ['default', ['junit', { outputFile: `${testReportDirectory}/results.xml` }]]
      : ['default'],

    coverage: {
      enabled: Boolean(process.env.CI),
      provider: 'istanbul',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.d.ts', '**/*capturedExceptions.ts', '**/*specHelper.ts'],
      reporter: ['text-summary', 'html', 'clover'],
      reportsDirectory: getCoverageReportDirectory(),
    },
  },
  optimizeDeps: {
    // Pre-bundle dependencies the scanner can't see, so Vite doesn't discover them mid-run and reload
    // the page, which breaks all the following test files when they share the page (`isolate: false`).
    // `react/jsx-dev-runtime` is injected by the JSX transform.
    include: ['pako', 'react/jsx-dev-runtime'],
  },

  oxc: {
    jsx: { runtime: 'automatic' },
  },

  resolve: {
    alias: [
      ...getTsconfigPathsAliases(),
      // Test helpers, e.g. `@datadog/browser-core/test`
      { find: /^@datadog\/browser-(.+\/.*)$/, replacement: `${ROOT}/packages/browser-$1` },
      { find: /^packages\/(.*)$/, replacement: `${ROOT}/packages/$1` },
    ],
  },
  define: {
    ...getBuildEnvDefines({ setup: 'cdn', version: 'test', workerString: true }),
  },
}

// eslint-disable-next-line import-x/no-default-export
export default defineConfig(config)
