import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/core',
    ],
    browser: {
      provider: 'playwright', // or 'webdriverio'
      enabled: true,
      // at least one instance is required
      instances: [
        { browser: 'chromium' },
      ],
    },
    // globals: true,
  },
})