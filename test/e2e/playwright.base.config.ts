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
  tsconfig: './tsconfig.json',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: 5,
  reporter: reporters,
  use: {
    trace: isCi ? 'off' : 'retain-on-failure',
  },

  webServer: isLocal
    ? {
        stdout: 'pipe',
        cwd: path.join(__dirname, '../..'),
        command: 'yarn dev',
        url: DEV_SERVER_BASE_URL,
        reuseExistingServer: true,
      }
    : undefined,
}
