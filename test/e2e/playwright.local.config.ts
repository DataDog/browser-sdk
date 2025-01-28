import { defineConfig, devices } from '@playwright/test'
import { config as baseConfig } from './playwright.base.config'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
