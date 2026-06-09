import { defineConfig, devices } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'

const isCi = !!process.env.CI

export default defineConfig({
  testDir: './scenario/salesforce',
  testMatch: '**/*.scenario.ts',
  timeout: 60_000,
  navigationTimeout: 30_000,
  workers: 1,
  retries: isCi ? 1 : 0,
  reporter: isCi
    ? [['junit', { outputFile: `${getTestReportDirectory()}/salesforce-results.xml` }], ['line']]
    : [['line']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

