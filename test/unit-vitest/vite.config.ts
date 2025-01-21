import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import { webdriverio } from '@vitest/browser-webdriverio'
import { playwright } from '@vitest/browser-playwright'
import { buildEnvKeys, getBuildEnvValue } from '../../scripts/lib/buildEnv.ts'

const ROOT = resolve(import.meta.dirname, '../..')

// eslint-disable-next-line import-x/no-default-export
export default defineConfig({
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
    },

    setupFiles: [resolve(import.meta.dirname, 'vitest.setup.ts')],
    restoreMocks: true,
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
      { find: /^@datadog\/browser-([^\\/]+)$/, replacement: `${ROOT}/packages/browser-$1/src` },
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

    ...Object.fromEntries(buildEnvKeys.map((key) => [`__BUILD_ENV__${key}__`, JSON.stringify(getBuildEnvValue(key))])),
  },
})
