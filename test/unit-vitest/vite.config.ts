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
  plugins: [
    {
      // Karma serves files under `/base/`, and some specs load fixtures from there
      name: 'karma-base-path',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/base/')) {
            req.url = req.url.slice('/base'.length)
          }
          next()
        })
      },
    },
  ],
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

    // forEach.ts is loaded as a separate setup file (instead of a top-level await import) so it
    // runs after the Jasmine globals are defined.
    setupFiles: [
      resolve(import.meta.dirname, 'vitest.setup.ts'),
      resolve(ROOT, 'packages/browser-core/test/forEach.ts'),
    ],
    restoreMocks: true,

    // Run all test files in the same page, like Karma did. Tests are kept independent by the global
    // cleanup in forEach.ts and `registerCleanupTask()`, and reloading the page for each file is
    // what makes isolated runs slow.
    isolate: false,

    // Run files and tests in random order (like Jasmine's `random: true`). Reproduce an order
    // with `--sequence.seed=<seed>`.
    sequence: { shuffle: { files: true, tests: true } },

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
      exclude: ['**/*.spec.ts', '**/*.d.ts', '**/capturedExceptions.ts', '**/specHelper.ts'],
      reporter: ['text-summary', 'html', 'clover'],
      reportsDirectory: getCoverageReportDirectory(),
    },
  },
  optimizeDeps: {
    include: ['jasmine-core/lib/jasmine-core/jasmine.js', 'pako'],
    rolldownOptions: {
      plugins: [
        {
          name: 'fix-jasmine-strict-mode',
          // jasmine-core 3.99.1 uses undeclared `i` in asymmetricEqualityTesterArgCompatShim.
          // This works in non-strict mode but fails when Vite converts CJS to strict ESM.
          transform: {
            filter: { id: { include: [/jasmine\.js$/] } },
            handler(code) {
              return code.replace(
                'for (i = 0; i < customEqualityTesters.length; i++)',
                'for (var i = 0; i < customEqualityTesters.length; i++)'
              )
            },
          },
        },
      ],
    },
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
      { find: /.*\/allJsonSchemas$/, replacement: resolve(import.meta.dirname, 'allJsonSchemas.ts') },
      {
        find: /.*\/getCurrentJasmineSpec$/,
        replacement: resolve(import.meta.dirname, 'getCurrentJasmineSpec.ts'),
      },
      {
        find: /.*\/registerCleanupTask$/,
        replacement: resolve(import.meta.dirname, 'registerCleanupTask.ts'),
      },
      {
        find: /.*\/disableJasmineUncaughtExceptionTracking/,
        replacement: resolve(import.meta.dirname, 'disableJasmineUncaughtExceptionTracking.ts'),
      },
    ],
  },
  define: {
    // jasmine-core uses `global` in its CJS module detection; without this, it falls back to an
    // empty object as the "global", causing the mock clock to patch {} instead of window.
    global: 'globalThis',

    ...getBuildEnvDefines({ setup: 'cdn', version: 'test', workerString: true }),
  },
}

// eslint-disable-next-line import-x/no-default-export
export default defineConfig(config)
