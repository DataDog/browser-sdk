import path from 'path'
import type { ReporterDescription, Config } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'

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
  testIgnore: ['**/android/**'],
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
        wait: {
          stdout: /Server listening on port (?<dev_server_port>\d+)/,
        },
      }
    : undefined,
}
