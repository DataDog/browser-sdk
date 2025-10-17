import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    browser: {
      provider: 'playwright', // or 'webdriverio'
      enabled: true,
      // at least one instance is required
      instances: [
        { browser: 'chromium' },
      ],
      // Prevent browser crashes from intentional test errors
      providerOptions: {
        context: {
          ignoreHTTPSErrors: true,
        },
      },
    },
    globals: true,
    setupFiles: [
      './test/index.ts',
      './test/buildEnv.ts',
    ],
    // Don't fail the entire suite on uncaught errors during error-testing tests
    dangerouslyIgnoreUnhandledErrors: false,
  },
})
