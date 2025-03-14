import path from 'path'
import type { ReporterDescription, Config } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'
import { DEV_SERVER_BASE_URL } from './lib/helpers/playwright'

const isCi = !!process.env.CI
const isLocal = !isCi

const testReportDirectory = getTestReportDirectory()
const reporters: ReporterDescription[] = [['line'], ['./noticeReporter.ts']]

if (testReportDirectory) {
  reporters.push(['junit', { outputFile: path.join(process.cwd(), testReportDirectory, 'results.xml') }])
} else {
  reporters.push(['html'])
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export const config: Config = {
  testDir: './scenario',
  testMatch: ['**/*.scenario.ts'],
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: 25,
  reporter: reporters,
  use: {
    trace: isCi ? 'off' : 'retain-on-failure',
  },
  webServer: isLocal
    ? {
        command: 'yarn dev',
        url: DEV_SERVER_BASE_URL,
        reuseExistingServer: true,
      }
    : undefined,
}
