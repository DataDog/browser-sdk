import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.salesforce.base.config'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  projects: [
    {
      name: 'chromium',
      metadata: {
        sessionName: 'Desktop Chrome',
        name: 'chromium',
      },
      use: devices['Desktop Chrome'],
    },
  ],
})
