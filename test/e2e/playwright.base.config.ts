import { ReporterDescription, Config } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'

const reporters: ReporterDescription[] = [['line'], ['./notice-reporter.ts']]

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push([
    'junit',
    {
      outputFile: `${testReportDirectory}/results.xml`,
    },
  ])
} else {
  reporters.push(['html'])
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export const config: Config = {
  testDir: './scenario',
  testMatch: ['**/*.scenario.ts'],
  testIgnore: ['developer-extension/*.scenario.ts', '**/sessions.scenario.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 20,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: reporters,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    trace: 'on-first-retry',
  },
}
