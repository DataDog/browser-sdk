import { defineConfig } from '@playwright/test'
import { config as baseConfig } from './playwright.base.config'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  testDir: './scenario/salesforce',
  webServer: undefined,
  fullyParallel: false,
  workers: 1,
})
