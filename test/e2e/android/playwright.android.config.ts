import path from 'path'
import type { ReporterDescription } from '@playwright/test'
import { defineConfig } from '@playwright/test'
import { getTestReportDirectory } from '../../envUtils'

const testReportDirectory = getTestReportDirectory()
const reporters: ReporterDescription[] = [['line']]

if (testReportDirectory) {
  reporters.push(['junit', { outputFile: path.join(process.cwd(), testReportDirectory, 'results.xml') }])
} else {
  reporters.push(['html'])
}

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  testDir: '../scenario/android',
  testMatch: ['**/*.scenario.ts'],
  tsconfig: '../tsconfig.json',
  globalSetup: './globalSetup.ts',
  globalTeardown: './globalTeardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  reporter: reporters,
  use: {
    trace: 'retain-on-failure',
  },
})
