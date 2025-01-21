import { resolve } from 'path'
import { readFile } from 'fs/promises'
import { defineConfig } from 'vitest/config'
import { webdriverio } from '@vitest/browser-webdriverio'
import { playwright } from '@vitest/browser-playwright'
import { buildEnvKeys, getBuildEnvValue } from '../../scripts/lib/buildEnv.ts'

const ROOT = resolve(import.meta.dirname, '../..')

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },

    setupFiles: [
      resolve(import.meta.dirname, 'vitest.setup.ts'),
      // Global beforeEach/afterEach hooks that reset SDK module state between tests (mirrors Karma setup)
      resolve(ROOT, 'packages/core/test/forEach.spec.ts'),
    ],
    restoreMocks: true,
    onUnhandledError(error): boolean | void {
      if (error.message === 'expected error') {
        return false
      }
      if ('VITEST_TEST_PATH' in error && error.VITEST_TEST_PATH.endsWith('trackRuntimeError.spec.ts')) {
        return false
      }
      console.log(error)
    },
  },
  optimizeDeps: {
    include: ['jasmine-core/lib/jasmine-core/jasmine.js', 'pako'],
    esbuildOptions: {
      plugins: [
        {
          name: 'fix-jasmine-strict-mode',
          setup(build) {
            // jasmine-core 3.99.1 uses undeclared `i` in asymmetricEqualityTesterArgCompatShim.
            // This works in non-strict mode but fails when Vite converts CJS to strict ESM.
            build.onLoad({ filter: /jasmine\.js$/ }, async (args) => {
              const code = await readFile(args.path, 'utf-8')
              return {
                contents: code.replace(
                  'for (i = 0; i < customEqualityTesters.length; i++)',
                  'for (var i = 0; i < customEqualityTesters.length; i++)'
                ),
                loader: 'js',
              }
            })
          },
        },
      ],
    },
  },

  resolve: {
    alias: [
      { find: /^@datadog\/browser-([^\\/]+)$/, replacement: `${ROOT}/packages/$1/src` },
      { find: /^@datadog\/browser-(.+\/.*)$/, replacement: `${ROOT}/packages/$1` },
      { find: /^packages\/(.*)$/, replacement: `${ROOT}/packages/$1` },
      { find: /^\.\/allJsonSchemas$/, replacement: resolve(import.meta.dirname, 'allJsonSchemas.ts') },
      {
        find: /^(.+\/)?getCurrentJasmineSpec$/,
        replacement: resolve(import.meta.dirname, 'getCurrentJasmineSpec.ts'),
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
