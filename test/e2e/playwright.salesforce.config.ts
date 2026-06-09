import { defineConfig, devices } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'

const isCi = !!process.env.CI

// eslint-disable-next-line import-x/no-default-export
export default defineConfig({
  testDir: './scenario/salesforce',
  testMatch: '**/*.scenario.ts',
  timeout: 60_000,
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
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
})
