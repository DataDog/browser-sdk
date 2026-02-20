import path from 'path'
import type { ReporterDescription, Config } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'
import { DEV_SERVER_BASE_URL, NEXTJS_APP_URL, NEXTJS_PAGES_URL } from './lib/helpers/playwright'

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

  webServer: [
    ...(isLocal
      ? [
          {
            stdout: 'pipe' as const,
            cwd: path.join(__dirname, '../..'),
            command: 'yarn dev',
            url: DEV_SERVER_BASE_URL,
            reuseExistingServer: true,
          },
        ]
      : []),
    {
      stdout: 'pipe' as const,
      cwd: path.join(__dirname, '../apps/nextjs-app-router'),
      command: isLocal ? 'yarn dev' : 'yarn start',
      url: NEXTJS_APP_URL,
      reuseExistingServer: true,
    },
    {
      stdout: 'pipe' as const,
      cwd: path.join(__dirname, '../apps/nextjs-pages-router'),
      command: isLocal ? 'yarn dev' : 'yarn start',
      url: NEXTJS_PAGES_URL,
      reuseExistingServer: true,
    },
  ],
}
