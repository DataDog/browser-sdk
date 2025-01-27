import { config as baseConfig } from './playwright.base.config'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  ...baseConfig,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
