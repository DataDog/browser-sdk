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
            wait: {
              stdout: /Server listening on port (?<dev_server_port>\d+)/,
            },
          },
        ]
      : []),
    {
      stdout: 'pipe' as const,
      cwd: path.join(__dirname, '../apps/nextjs'),
      command: isLocal ? 'yarn dev' : 'yarn start',
      wait: {
        stdout: /- Local:\s+http:\/\/localhost:(?<nextjs_app_router_port>\d+)/,
      },
    },
    {
      stdout: 'pipe' as const,
      cwd: path.join(__dirname, '../apps/vue-router-app'),
      command: isLocal ? 'yarn dev' : 'yarn preview',
      wait: {
        stdout: /Local:\s+http:\/\/localhost:(?<vue_router_app_port>\d+)/,
      },
    },
  ],
}
