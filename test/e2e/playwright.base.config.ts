import path from 'path'
import type { ReporterDescription, Config } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'

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
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 25,
  reporter: reporters,
  use: {
    trace: process.env.CI ? 'off' : 'retain-on-failure',
  },
}
